import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
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

class DownloadCancelledError extends Error {
    constructor() {
        super('Установка отменена')
        this.name = 'DownloadCancelledError'
    }
}

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

function safeUnlink(path: string): void {
    try {
        if (existsSync(path)) {
            unlinkSync(path)
        }
    } catch (_error: unknown) {
        void _error
    }
}

function assertOutputFile(target: string): void {
    if (!existsSync(target)) {
        throw new Error('Файл не создан')
    }
    if (statSync(target).size <= 0) {
        safeUnlink(target)
        throw new Error('Файл пустой')
    }
}

export class DownloadService {
    private running = false
    private cancelled = false
    private abortController: AbortController | null = null
    private readonly children = new Set<ChildProcess>()
    private readonly temps = new Set<string>()

    constructor(private readonly getWindow: () => BrowserWindow | null) {}

    private emit(progress: DownloadProgress): void {
        this.getWindow()?.webContents.send('download:progress', progress)
    }

    private throwIfCancelled(): void {
        if (this.cancelled) {
            throw new DownloadCancelledError()
        }
    }

    private trackTemp(path: string): void {
        this.temps.add(path)
    }

    private releaseTemp(path: string): void {
        this.temps.delete(path)
    }

    private cleanupTemps(): void {
        for (const path of this.temps) {
            safeUnlink(path)
        }
        this.temps.clear()
    }

    private killChildren(): void {
        for (const child of this.children) {
            try {
                child.kill('SIGKILL')
            } catch (_error: unknown) {
                void _error
            }
        }
        this.children.clear()
    }

    cancel(): { ok: true } {
        if (!this.running) {
            return { ok: true }
        }
        this.cancelled = true
        this.abortController?.abort()
        this.killChildren()
        this.cleanupTemps()
        logInfo('download', 'cancel requested')
        return { ok: true }
    }

    private async downloadDirect(url: string, target: string): Promise<void> {
        this.throwIfCancelled()
        let res: Response
        try {
            res = await fetch(url, { signal: this.abortController?.signal })
        } catch (err: unknown) {
            if (this.cancelled || (err instanceof Error && err.name === 'AbortError')) {
                throw new DownloadCancelledError()
            }
            throw err
        }
        this.throwIfCancelled()
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }
        let buf: Buffer
        try {
            buf = Buffer.from(await res.arrayBuffer())
        } catch (err: unknown) {
            if (this.cancelled || (err instanceof Error && err.name === 'AbortError')) {
                throw new DownloadCancelledError()
            }
            throw err
        }
        this.throwIfCancelled()
        if (buf.byteLength <= 0) {
            throw new Error('Пустой ответ сервера')
        }
        const tmp = `${target}.part`
        this.trackTemp(tmp)
        writeFileSync(tmp, buf)
        this.throwIfCancelled()
        renameSync(tmp, target)
        this.releaseTemp(tmp)
        assertOutputFile(target)
    }

    private runFfmpegOnce(
        ffmpegPath: string,
        args: string[],
        tmp: string
    ): Promise<{ code: number | null; stderr: string }> {
        return new Promise((resolve, reject) => {
            if (this.cancelled) {
                reject(new DownloadCancelledError())
                return
            }

            const spawnOpts: SpawnOptions = {
                stdio: ['ignore', 'ignore', 'pipe'],
                windowsHide: true
            }
            const child = spawn(ffmpegPath, args, spawnOpts)
            this.children.add(child)
            this.trackTemp(tmp)

            let stderr = ''
            child.stderr?.on('data', (chunk: Buffer) => {
                stderr += chunk.toString()
                if (stderr.length > 4000) {
                    stderr = stderr.slice(-4000)
                }
            })
            child.on('error', (err: Error) => {
                this.children.delete(child)
                reject(new Error(`Не удалось запустить ffmpeg (${ffmpegPath}): ${err.message}`))
            })
            child.on('close', (code: number | null) => {
                this.children.delete(child)
                if (this.cancelled) {
                    safeUnlink(tmp)
                    this.releaseTemp(tmp)
                    reject(new DownloadCancelledError())
                    return
                }
                resolve({ code, stderr })
            })
        })
    }

    private async runFfmpeg(ffmpegPath: string, url: string, target: string): Promise<void> {
        const tmp = `${target}.part.mp3`
        const copyArgs = [
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

        const first = await this.runFfmpegOnce(ffmpegPath, copyArgs, tmp)
        if (first.code === 0 && existsSync(tmp)) {
            this.throwIfCancelled()
            renameSync(tmp, target)
            this.releaseTemp(tmp)
            assertOutputFile(target)
            return
        }

        safeUnlink(tmp)
        this.throwIfCancelled()

        const encodeArgs = [
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
        const second = await this.runFfmpegOnce(ffmpegPath, encodeArgs, tmp)
        if (second.code === 0 && existsSync(tmp)) {
            this.throwIfCancelled()
            renameSync(tmp, target)
            this.releaseTemp(tmp)
            assertOutputFile(target)
            return
        }

        safeUnlink(tmp)
        this.releaseTemp(tmp)
        throw new Error(`ffmpeg failed: ${second.stderr.slice(-500) || `code ${second.code}`}`)
    }

    private async downloadOne(url: string, target: string, ffmpegPath: string): Promise<void> {
        if (isHlsUrl(url)) {
            await this.runFfmpeg(ffmpegPath, url, target)
            return
        }
        try {
            await this.downloadDirect(url, target)
        } catch (err: unknown) {
            if (err instanceof DownloadCancelledError) {
                throw err
            }
            this.throwIfCancelled()
            await this.runFfmpeg(ffmpegPath, url, target)
        }
    }

    async start(
        session: VkSession,
        tracks: Track[],
        trackKeys: string[],
        directory: string
    ): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
        if (this.running) {
            return { ok: false, error: 'Скачивание уже выполняется' }
        }
        this.running = true
        this.cancelled = false
        this.abortController = new AbortController()
        this.temps.clear()
        this.children.clear()

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

            this.throwIfCancelled()
            const freshUrls = await refreshTrackUrls(
                session,
                selected.map((track: Track) => trackKey(track))
            )
            this.throwIfCancelled()

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
                    if (this.cancelled) {
                        return
                    }
                    const currentIndex = nextIndex
                    if (currentIndex >= selected.length) {
                        return
                    }
                    nextIndex += 1
                    const current = selected[currentIndex]
                    const key = trackKey(current)
                    const base = buildTrackFileBase(current.artist, current.title, key)
                    const primaryPath = join(directory, `${base}.mp3`)
                    if (existsSync(primaryPath) && statSync(primaryPath).size > 0) {
                        completed += 1
                        this.emit({
                            trackKey: key,
                            status: 'done',
                            completed,
                            total,
                            fileName: primaryPath
                        })
                        continue
                    }

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

                    const target = claimTarget(base)
                    this.trackTemp(`${target}.part`)
                    this.trackTemp(`${target}.part.mp3`)

                    try {
                        await this.downloadOne(url, target, ffmpegPath)
                        this.releaseTemp(`${target}.part`)
                        this.releaseTemp(`${target}.part.mp3`)
                        completed += 1
                        this.emit({
                            trackKey: key,
                            status: 'done',
                            completed,
                            total,
                            fileName: target
                        })
                    } catch (err: unknown) {
                        safeUnlink(`${target}.part`)
                        safeUnlink(`${target}.part.mp3`)
                        this.releaseTemp(`${target}.part`)
                        this.releaseTemp(`${target}.part.mp3`)
                        if (err instanceof DownloadCancelledError || this.cancelled) {
                            safeUnlink(target)
                            return
                        }
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
            this.cleanupTemps()
            this.getWindow()?.webContents.send('download:done', {
                completed,
                total,
                failed,
                cancelled: this.cancelled
            })

            if (this.cancelled) {
                return { ok: false, error: 'Установка отменена', cancelled: true }
            }
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
            this.cleanupTemps()
            if (err instanceof DownloadCancelledError || this.cancelled) {
                this.getWindow()?.webContents.send('download:done', {
                    completed,
                    total,
                    failed,
                    cancelled: true
                })
                return { ok: false, error: 'Установка отменена', cancelled: true }
            }
            return { ok: false, error: err instanceof Error ? err.message : String(err) }
        } finally {
            this.killChildren()
            this.cleanupTemps()
            this.abortController = null
            this.running = false
            this.cancelled = false
        }
    }
}
