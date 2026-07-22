import type { Track } from './types'
import { isRecord, readNumber, readString } from './guards'

export interface VkAudioItemRaw {
    id: number
    owner_id: number
    artist?: string
    title?: string
    duration?: number
    url?: string
    access_key?: string
}

export function mapVkAudioItem(item: VkAudioItemRaw): Track {
    return {
        id: item.id,
        ownerId: item.owner_id,
        artist: item.artist?.trim() || 'Unknown',
        title: item.title?.trim() || 'Untitled',
        duration: item.duration ?? 0,
        url: item.url ?? '',
        accessKey: item.access_key
    }
}

function readArtistName(value: Record<string, unknown>): string | undefined {
    const direct = readString(value.artist)?.trim()
    if (direct !== undefined && direct.length > 0) {
        return direct
    }

    const mainArtists = value.main_artists
    if (Array.isArray(mainArtists)) {
        const names: string[] = []
        for (const artist of mainArtists) {
            if (!isRecord(artist)) {
                continue
            }
            const name = readString(artist.name)?.trim()
            if (name !== undefined && name.length > 0) {
                names.push(name)
            }
        }
        if (names.length > 0) {
            return names.join(', ')
        }
    }

    const featured = value.featured_artists
    if (Array.isArray(featured)) {
        const names: string[] = []
        for (const artist of featured) {
            if (!isRecord(artist)) {
                continue
            }
            const name = readString(artist.name)?.trim()
            if (name !== undefined && name.length > 0) {
                names.push(name)
            }
        }
        if (names.length > 0) {
            return names.join(', ')
        }
    }

    return undefined
}

export function parseVkAudioItem(value: unknown): VkAudioItemRaw | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    const id = readNumber(value.id)
    const ownerId = readNumber(value.owner_id)
    if (id === undefined || ownerId === undefined) {
        return undefined
    }
    const item: VkAudioItemRaw = {
        id,
        owner_id: ownerId
    }
    const artist = readArtistName(value)
    if (artist !== undefined) {
        item.artist = artist
    }
    const title = readString(value.title)
    if (title !== undefined) {
        item.title = title
    }
    const duration = readNumber(value.duration)
    if (duration !== undefined) {
        item.duration = duration
    }
    const url = readString(value.url)
    if (url !== undefined) {
        item.url = url
    }
    const accessKey = readString(value.access_key)
    if (accessKey !== undefined) {
        item.access_key = accessKey
    }
    return item
}

export function parseAudioGetResponse(
    value: unknown
): { count: number; items: VkAudioItemRaw[] } | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    const count = readNumber(value.count)
    if (count === undefined || !Array.isArray(value.items)) {
        return undefined
    }
    const items: VkAudioItemRaw[] = []
    for (const entry of value.items) {
        const item = parseVkAudioItem(entry)
        if (item !== undefined) {
            items.push(item)
        }
    }
    return { count, items }
}

export function parseAudioGetByIdResponse(value: unknown): VkAudioItemRaw[] {
    if (!Array.isArray(value)) {
        return []
    }
    const items: VkAudioItemRaw[] = []
    for (const entry of value) {
        const item = parseVkAudioItem(entry)
        if (item !== undefined) {
            items.push(item)
        }
    }
    return items
}

export function indexAudiosByKey(value: unknown): Map<string, VkAudioItemRaw> {
    const map = new Map<string, VkAudioItemRaw>()
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const entry of node) {
                walk(entry)
            }
            return
        }
        if (!isRecord(node)) {
            return
        }
        const item = parseVkAudioItem(node)
        if (item !== undefined && (item.title !== undefined || item.url !== undefined)) {
            map.set(`${item.owner_id}_${item.id}`, item)
        }
        for (const nested of Object.values(node)) {
            if (nested !== null && typeof nested === 'object') {
                walk(nested)
            }
        }
    }
    walk(value)
    return map
}

export function pickAudiosByIds(
    audioIndex: Map<string, VkAudioItemRaw>,
    ids: string[]
): VkAudioItemRaw[] {
    const items: VkAudioItemRaw[] = []
    for (const id of ids) {
        const item = audioIndex.get(id)
        if (item !== undefined) {
            items.push(item)
        }
    }
    return items
}

export function findMyMusicSectionId(value: unknown, ownerId: number): string | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    const catalog = isRecord(value.catalog) ? value.catalog : value
    if (!isRecord(catalog) || !Array.isArray(catalog.sections)) {
        return undefined
    }

    const ownerNeedle = `audios${ownerId}`
    let fallback: string | undefined

    for (const section of catalog.sections) {
        if (!isRecord(section)) {
            continue
        }
        const id = readString(section.id) ?? readString(section.section_id)
        if (id === undefined) {
            continue
        }
        const title = (readString(section.title) ?? '').toLowerCase()
        const url = (readString(section.url) ?? '').toLowerCase()

        if (
            url.includes(ownerNeedle) ||
            title.includes('моя музыка') ||
            title.includes('my music') ||
            title.includes('аудиозаписи') ||
            title.includes('audios')
        ) {
            return id
        }

        if (fallback === undefined && !title.includes('обзор') && !title.includes('overview')) {
            fallback = id
        }
    }

    const defaultSection = readString(catalog.default_section)
    return fallback ?? defaultSection
}

export type CatalogMusicBlock = {
    audioIds: string[]
    nextFrom?: string
    isRecent: boolean
    title?: string
    url?: string
}

function isRecentMusicBlock(url: string, title: string): boolean {
    const haystack = `${url} ${title}`
    return (
        haystack.includes('block=recent') ||
        haystack.includes('recent') ||
        haystack.includes('недавно') ||
        haystack.includes('recently played') ||
        haystack.includes('слушали')
    )
}

export function extractMusicAudioBlocks(value: unknown): CatalogMusicBlock[] {
    const blocks: CatalogMusicBlock[] = []

    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const entry of node) {
                walk(entry)
            }
            return
        }
        if (!isRecord(node)) {
            return
        }

        if (node.data_type === 'music_audios' && Array.isArray(node.audios_ids)) {
            const url = (readString(node.url) ?? '').toLowerCase()
            const title = (readString(node.title) ?? '').toLowerCase()
            const audioIds = node.audios_ids.filter(
                (id): id is string => typeof id === 'string' && id.includes('_')
            )
            blocks.push({
                audioIds,
                nextFrom: readString(node.next_from),
                isRecent: isRecentMusicBlock(url, title),
                title: readString(node.title),
                url: readString(node.url)
            })
        }

        for (const nested of Object.values(node)) {
            if (nested !== null && typeof nested === 'object') {
                walk(nested)
            }
        }
    }

    walk(value)
    return blocks
}

export function pickMyMusicBlock(blocks: CatalogMusicBlock[]): CatalogMusicBlock | undefined {
    return blocks.find((block) => !block.isRecent && block.audioIds.length > 0) ?? blocks[0]
}

export function pickRecentBlock(blocks: CatalogMusicBlock[]): CatalogMusicBlock | undefined {
    return blocks.find((block) => block.isRecent && block.audioIds.length > 0)
}

export function parseCatalogSectionCursor(
    value: unknown
): { sectionId?: string; nextFrom?: string } | undefined {
    if (!isRecord(value)) {
        return undefined
    }

    if (isRecord(value.section)) {
        return {
            sectionId: readString(value.section.id) ?? readString(value.section.section_id),
            nextFrom: readString(value.section.next_from)
        }
    }

    const catalog = isRecord(value.catalog) ? value.catalog : value
    if (!isRecord(catalog)) {
        return undefined
    }

    return {
        sectionId: readString(catalog.default_section),
        nextFrom: undefined
    }
}
