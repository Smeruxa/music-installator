import { spawn, type SpawnOptions } from 'node:child_process'
import {
    existsSync,
    renameSync,
    unlinkSync,
    writeFileSync,
    readdirSync,
    statSync
} from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { DownloadProgress, Track, VkSession } from '../../shared/types'
import { trackKey } from '../../shared/selection'
import { buildTrackFileBase, isHlsUrl, nextAvailableFileName } from '../../shared/files'
import { refreshTrackUrls } from './vk-audio'
import { logError, logInfo, logWarn } from './logger'

const require = createRequire(import.meta.url)

function resolveFfmpegPath(): string {
    const candidates: string[] = []
    const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

    if (process.resourcesPath) {
        candidates.push(join(process.resourcesPath, exeName))
        candidates.push(join(process.resourcesPath, 'ffmpeg', exeName))
    }

    try {
        const resolved: unknown = require('ffmpeg-static')
        if (typeof resolved === 'string') {
            candidates.push(resolved)
            const unpacked = resolved.includes('app.asar.unpacked')
                ? resolved
                : resolved.replace('app.asar', 'app.asar.unpacked')
            candidates.push(unpacked)
            if (process.platform === 'win32' && !resolved.endsWith('.exe')) {
                candidates.push(`${resolved}.exe`)
                candidates.push(resolved.replace(/ffmpeg$/i, 'ffmpeg.exe'))
                candidates.push(unpacked.replace(/ffmpeg$/i, 'ffmpeg.exe'))
            }
        }
    } catch (err: unknown) {
        logWarn('download', 'ffmpeg-static resolve failed', err)
    }

    try {
        const moduleDir = app.isPackaged
            ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static')
            : join(process.cwd(), 'node_modules', 'ffmpeg-static')
        candidates.push(join(moduleDir, exeName))
    } catch (_error: unknown) {
        void _error
    }

    for (const candidate of candidates) {
        if (candidate.length > 0 && existsSync(candidate)) {
            return candidate
        }
    }

    return exeName
}

function assertOutputFile(target: string): void {
    if (!existsSync(target)) {
        throw new Error('Файл не создан')
    }
    if (statSync(target).size <= 0) {
        try {
            unlinkSync(target)
        } catch (_error: unknown) {
            void _error
        }
        throw new Error('Файл пустой')
    }
}

async function downloadDirect(url: string, target: string): Promise<void> {
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength <= 0) {
        throw new Error('Пустой ответ сервера')
    }
    const tmp = `${target}.part`
    writeFileSync(tmp, buf)
    renameSync(tmp, target)
    assertOutputFile(target)
}

function runFfmpeg(ffmpegPath: string, url: string, target: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tmp = `${target}.part.mp3`
        const spawnOpts: SpawnOptions = {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true
        }
        const args = [
            '-y',
            '-http_persistent',
            'false',
            '-i',
            url,
            '-vn',
            '-c',
            'copy',
            '-f',
            'mp3',
            tmp
        ]

        const child = spawn(ffmpegPath, args, spawnOpts)
        let stderr = ''
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
            if (stderr.length > 4000) {
                stderr = stderr.slice(-4000)
            }
        })
        child.on('error', (err: Error) => {
            reject(new Error(`Не удалось запустить ffmpeg (${ffmpegPath}): ${err.message}`))
        })
        child.on('close', (code: number | null) => {
            if (code === 0 && existsSync(tmp)) {
                try {
                    renameSync(tmp, target)
                    assertOutputFile(target)
                    resolve()
                } catch (err: unknown) {
                    reject(err instanceof Error ? err : new Error(String(err)))
                }
                return
            }

            const args2 = [
                '-y',
                '-http_persistent',
                'false',
                '-i',
                url,
                '-vn',
                '-c:a',
                'libmp3lame',
                '-q:a',
                '2',
                tmp
            ]
            const child2 = spawn(ffmpegPath, args2, spawnOpts)
            let stderr2 = stderr
            child2.stderr?.on('data', (chunk: Buffer) => {
                stderr2 += chunk.toString()
            })
            child2.on('error', (err: Error) => {
                reject(new Error(`Не удалось запустить ffmpeg (${ffmpegPath}): ${err.message}`))
            })
            child2.on('close', (code2: number | null) => {
                try {
                    if (existsSync(tmp) && code2 !== 0) {
                        unlinkSync(tmp)
                    }
                } catch (_error: unknown) {
                    void _error
                }
                if (code2 === 0 && existsSync(tmp)) {
                    try {
                        renameSync(tmp, target)
                        assertOutputFile(target)
                        resolve()
                    } catch (err: unknown) {
                        reject(err instanceof Error ? err : new Error(String(err)))
                    }
                    return
                }
                reject(new Error(`ffmpeg failed: ${stderr2.slice(-500) || `code ${code2}`}`))
            })
        })
    })
}

async function downloadOne(url: string, target: string, ffmpegPath: string): Promise<void> {
    if (isHlsUrl(url)) {
        await runFfmpeg(ffmpegPath, url, target)
        return
    }
    try {
        await downloadDirect(url, target)
    } catch {
        await runFfmpeg(ffmpegPath, url, target)
    }
}

export class DownloadService {
    private running = false

    constructor(private readonly getWindow: () => BrowserWindow | null) {}

    private emit(progress: DownloadProgress): void {
        this.getWindow()?.webContents.send('download:progress', progress)
    }

    async start(
        session: VkSession,
        tracks: Track[],
        trackKeys: string[],
        directory: string
    ): Promise<{ ok: true } | { ok: false; error: string }> {
        if (this.running) {
            return { ok: false, error: 'Скачивание уже выполняется' }
        }
        this.running = true

        const byKey = new Map(tracks.map((track: Track) => [trackKey(track), track]))
        const selected = trackKeys
            .map((key: string) => byKey.get(key))
            .filter((track: Track | undefined): track is Track => track !== undefined)
        const total = selected.length
        let completed = 0
        let failed = 0
        let lastFailure: string | null = null

        try {
            if (total === 0) {
                return { ok: false, error: 'Нет треков для скачивания' }
            }

            const ffmpegPath = resolveFfmpegPath()
            logInfo('download', 'ffmpeg path', {
                ffmpegPath,
                exists: existsSync(ffmpegPath),
                platform: process.platform,
                packaged: app.isPackaged
            })
            if (!existsSync(ffmpegPath) && ffmpegPath.includes('ffmpeg')) {
                const message =
                    'ffmpeg не найден в сборке. Пересобери Windows-инсталлер через npm run dist:win'
                logError('download', message, { ffmpegPath })
                return { ok: false, error: message }
            }

            const freshUrls = await refreshTrackUrls(
                session,
                selected.map((track: Track) => trackKey(track))
            )

            const concurrency = Math.min(4, Math.max(selected.length, 1))
            let nextIndex = 0
            const reservedNames = new Set(readdirSync(directory))

            const claimTarget = (baseName: string): string => {
                const fileName = nextAvailableFileName(reservedNames, baseName, 'mp3')
                reservedNames.add(fileName)
                return join(directory, fileName)
            }

            const worker = async (): Promise<void> => {
                for (;;) {
                    const currentIndex = nextIndex
                    if (currentIndex >= selected.length) {
                        return
                    }
                    nextIndex += 1
                    const current = selected[currentIndex]
                    const key = trackKey(current)
                    this.emit({
                        trackKey: key,
                        status: 'downloading',
                        completed,
                        total
                    })

                    const url = freshUrls.get(key) || current.url
                    if (!url) {
                        completed += 1
                        failed += 1
                        lastFailure = 'Нет URL для трека'
                        this.emit({
                            trackKey: key,
                            status: 'error',
                            completed,
                            total,
                            error: lastFailure
                        })
                        continue
                    }

                    const base = buildTrackFileBase(current.artist, current.title, key)
                    const target = claimTarget(base)

                    try {
                        await downloadOne(url, target, ffmpegPath)
                        completed += 1
                        this.emit({
                            trackKey: key,
                            status: 'done',
                            completed,
                            total,
                            fileName: target
                        })
                    } catch (err: unknown) {
                        completed += 1
                        failed += 1
                        lastFailure = err instanceof Error ? err.message : String(err)
                        logWarn('download', 'track failed', { key, error: lastFailure })
                        this.emit({
                            trackKey: key,
                            status: 'error',
                            completed,
                            total,
                            error: lastFailure
                        })
                    }
                }
            }

            await Promise.all(Array.from({ length: concurrency }, () => worker()))
            this.getWindow()?.webContents.send('download:done', { completed, total, failed })

            if (failed === total) {
                return {
                    ok: false,
                    error: lastFailure ?? 'Не удалось скачать ни одного трека'
                }
            }
            if (failed > 0) {
                return {
                    ok: false,
                    error: `Скачано с ошибками: ${total - failed}/${total}. ${lastFailure ?? ''}`
                }
            }
            return { ok: true }
        } catch (err: unknown) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) }
        } finally {
            this.running = false
        }
    }
}
