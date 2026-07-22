import type { Track, VkSession } from '../../shared/types'
import {
    findMyMusicSectionId,
    extractMusicAudioBlocks,
    indexAudiosByKey,
    mapVkAudioItem,
    parseAudioGetByIdResponse,
    parseAudioGetResponse,
    pickAudiosByIds,
    pickMyMusicBlock,
    pickRecentBlock,
    type VkAudioItemRaw
} from '../../shared/vk-audio-map'
import { isRecord, parseJsonUnknown, readNumber, readString } from '../../shared/guards'
import { WEB_API_HOST, WEB_API_VERSION, WEB_APP_ID } from '../../shared/vk-oauth'
import { nodeHttpText } from './node-http'
import { logError, logInfo, logWarn } from './logger'
import { refreshWebSession } from './vk-web-auth'

const PAGE_SIZE = 1000
const PAGE_TIMEOUT_MS = 45_000
const MAX_RETRIES = 3

export class VkApiError extends Error {
    readonly code?: number

    constructor(message: string, code?: number) {
        super(message)
        this.name = 'VkApiError'
        this.code = code
    }
}

function apiHost(session: VkSession): string {
    return session.client === 'web' ? WEB_API_HOST : 'https://api.vk.com'
}

function apiVersion(session: VkSession): string {
    return session.apiVersion ?? (session.client === 'web' ? WEB_API_VERSION : '5.131')
}

async function maybeRefresh(session: VkSession): Promise<VkSession> {
    if (session.client !== 'web') {
        return session
    }
    const expiresAt = session.tokenExpiresAt
    if (expiresAt === undefined || expiresAt - Date.now() > 10 * 60 * 1000) {
        return session
    }
    try {
        const refreshed = await refreshWebSession(session)
        if (refreshed !== undefined) {
            logInfo('vk-audio', 'web token refreshed')
            return refreshed
        }
    } catch (err: unknown) {
        logWarn('vk-audio', 'web token refresh failed', err)
    }
    return session
}

async function callMethod(
    session: VkSession,
    method: string,
    params: Record<string, string | number | undefined> = {}
): Promise<unknown> {
    const search = new URLSearchParams({
        access_token: session.token,
        v: apiVersion(session),
        lang: 'ru'
    })
    if (session.clientId !== undefined) {
        search.set('client_id', session.clientId)
    } else if (session.client === 'web') {
        search.set('client_id', WEB_APP_ID)
    }

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            search.set(key, String(value))
        }
    }

    const url = `${apiHost(session)}/method/${method}`
    logInfo('vk-audio', `POST ${method}`, {
        userId: session.userId,
        client: session.client ?? 'unknown',
        tokenPrefix: session.token.slice(0, 8),
        version: apiVersion(session),
        params: Object.keys(params)
    })

    const text = await nodeHttpText(url, {
        method: 'POST',
        headers: {
            'User-Agent': session.userAgent,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: search.toString(),
        timeoutMs: PAGE_TIMEOUT_MS
    })
    const data = parseJsonUnknown(text)
    if (!isRecord(data)) {
        logError('vk-audio', 'Non-JSON response', text.slice(0, 400))
        throw new VkApiError('Пустой ответ VK API')
    }
    if (isRecord(data.error)) {
        const code = readNumber(data.error.error_code)
        const message = readString(data.error.error_msg) ?? 'Ошибка VK API'
        logError('vk-audio', `${method} failed`, { code, message, body: text.slice(0, 500) })
        throw new VkApiError(message, code)
    }
    if (data.response === undefined) {
        logError('vk-audio', 'Empty response field', text.slice(0, 400))
        throw new VkApiError('Пустой ответ VK API')
    }
    return data.response
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        try {
            return await fn()
        } catch (err: unknown) {
            lastError = err
            logWarn('vk-audio', `retry ${attempt + 1}/${MAX_RETRIES}`, err)
            if (err instanceof VkApiError && (err.code === 3 || err.code === 5 || err.code === 15)) {
                break
            }
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 400 * (attempt + 1))
            })
        }
    }
    throw lastError
}

async function fetchViaAudioGet(
    session: VkSession,
    onProgress?: (loaded: number, total: number) => void
): Promise<Track[]> {
    const tracks: Track[] = []
    let offset = 0
    let total = Number.POSITIVE_INFINITY

    while (offset < total) {
        const pageRaw = await withRetry(() =>
            callMethod(session, 'audio.get', {
                owner_id: session.userId,
                count: PAGE_SIZE,
                offset
            })
        )
        const page = parseAudioGetResponse(pageRaw)
        if (page === undefined) {
            throw new VkApiError('Некорректный ответ audio.get')
        }
        total = page.count
        for (const item of page.items) {
            tracks.push(mapVkAudioItem(item))
        }
        offset += page.items.length
        onProgress?.(tracks.length, Number.isFinite(total) ? total : tracks.length)
        logInfo('vk-audio', 'audio.get page', { loaded: tracks.length, total, offset })
        if (page.items.length === 0) {
            break
        }
    }

    return tracks
}

function appendUnique(
    tracks: Track[],
    seen: Set<string>,
    items: VkAudioItemRaw[],
    onProgress?: (loaded: number, total: number) => void
): number {
    let added = 0
    for (const item of items) {
        const key = `${item.owner_id}_${item.id}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        tracks.push(mapVkAudioItem(item))
        added += 1
    }
    onProgress?.(tracks.length, tracks.length)
    return added
}

async function openMyMusicSection(session: VkSession): Promise<string> {
    const catalogRaw = await withRetry(() =>
        callMethod(session, 'catalog.getAudio', {
            owner_id: session.userId,
            need_blocks: 0,
            https: 1
        })
    )
    const sectionId = findMyMusicSectionId(catalogRaw, session.userId)
    if (sectionId === undefined) {
        throw new VkApiError('Не найдена секция «Моя музыка» в catalog.getAudio')
    }
    return sectionId
}

async function fetchRecentFromSection(session: VkSession, sectionId: string): Promise<Track[]> {
    const sectionRaw = await withRetry(() =>
        callMethod(session, 'catalog.getSection', {
            section_id: sectionId,
            https: 1
        })
    )
    const blocks = extractMusicAudioBlocks(sectionRaw)
    const recentBlock = pickRecentBlock(blocks)
    logInfo('vk-audio', 'recent block scan', {
        blockCount: blocks.length,
        blocks: blocks.map((block) => ({
            isRecent: block.isRecent,
            ids: block.audioIds.length,
            title: block.title,
            url: block.url
        }))
    })
    if (recentBlock === undefined) {
        return []
    }
    const audioIndex = indexAudiosByKey(sectionRaw)
    const items = pickAudiosByIds(audioIndex, recentBlock.audioIds)
    const tracks: Track[] = []
    const seen = new Set<string>()
    appendUnique(tracks, seen, items)
    return tracks
}

async function fetchViaCatalogMyMusic(
    session: VkSession,
    sectionId: string,
    onProgress?: (loaded: number, total: number) => void
): Promise<Track[]> {
    const tracks: Track[] = []
    const seen = new Set<string>()
    let nextFrom: string | undefined
    let pages = 0

    while (pages < 300) {
        pages += 1
        const sectionRaw = await withRetry(() =>
            callMethod(session, 'catalog.getSection', {
                section_id: sectionId,
                start_from: nextFrom,
                https: 1
            })
        )

        const blocks = extractMusicAudioBlocks(sectionRaw)
        const myBlock = pickMyMusicBlock(blocks)
        if (myBlock === undefined) {
            logWarn('vk-audio', 'no music_audios block in section page', {
                page: pages,
                blockCount: blocks.length
            })
            break
        }

        const audioIndex = indexAudiosByKey(sectionRaw)
        const pageItems = pickAudiosByIds(audioIndex, myBlock.audioIds)
        const added = appendUnique(tracks, seen, pageItems, onProgress)
        logInfo('vk-audio', 'my music section page', {
            page: pages,
            added,
            loaded: tracks.length,
            recentBlocks: blocks.filter((block) => block.isRecent).length,
            nextFrom: myBlock.nextFrom
        })

        nextFrom = myBlock.nextFrom
        if (nextFrom === undefined || nextFrom.length === 0 || added === 0) {
            break
        }
    }

    if (tracks.length === 0) {
        throw new VkApiError('Секция «Моя музыка» пуста')
    }

    return tracks
}

export async function fetchLibrary(
    session: VkSession,
    onProgress?: (loaded: number, total: number) => void
): Promise<{ recent: Track[]; myMusic: Track[] }> {
    const active = await maybeRefresh(session)
    logInfo('vk-audio', 'fetchLibrary start', {
        client: active.client ?? 'unknown',
        audioRefreshed: active.audioRefreshed === true
    })

    let recent: Track[] = []
    let sectionId: string | undefined

    try {
        sectionId = await openMyMusicSection(active)
        recent = await fetchRecentFromSection(active, sectionId)
        logInfo('vk-audio', 'recent loaded', { count: recent.length })
    } catch (err: unknown) {
        logWarn('vk-audio', 'recent unavailable', err)
    }

    try {
        const myMusic = await fetchViaAudioGet(active, onProgress)
        if (myMusic.length > 0) {
            return { recent, myMusic }
        }
    } catch (err: unknown) {
        logWarn('vk-audio', 'audio.get unavailable, using catalog my-music section', err)
    }

    if (sectionId === undefined) {
        sectionId = await openMyMusicSection(active)
        if (recent.length === 0) {
            try {
                recent = await fetchRecentFromSection(active, sectionId)
            } catch (err: unknown) {
                logWarn('vk-audio', 'recent unavailable on catalog fallback', err)
            }
        }
    }

    const myMusic = await fetchViaCatalogMyMusic(active, sectionId, onProgress)
    return { recent, myMusic }
}

export async function refreshTrackUrls(
    session: VkSession,
    trackKeys: string[]
): Promise<Map<string, string>> {
    const active = await maybeRefresh(session)
    const map = new Map<string, string>()
    const chunkSize = 50

    for (let i = 0; i < trackKeys.length; i += chunkSize) {
        const chunk = trackKeys.slice(i, i + chunkSize)
        try {
            const raw = await withRetry(() =>
                callMethod(active, 'audio.getById', {
                    audios: chunk.join(',')
                })
            )
            const items = parseAudioGetByIdResponse(raw)
            for (const item of items) {
                if (item.url) {
                    map.set(`${item.owner_id}_${item.id}`, item.url)
                }
            }
        } catch (err: unknown) {
            logWarn('vk-audio', 'audio.getById failed for chunk', err)
        }
    }

    return map
}
