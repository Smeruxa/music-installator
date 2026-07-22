import type { Track } from './types'

export function trackKey(track: Pick<Track, 'ownerId' | 'id'>): string {
    return `${track.ownerId}_${track.id}`
}

export function selectNearestKeys(
    tracks: readonly Track[],
    firstVisibleIndex: number,
    count: number
): string[] {
    const start = Math.max(0, firstVisibleIndex)
    const end = Math.min(tracks.length, start + count)
    const keys: string[] = []
    for (let index = start; index < end; index += 1) {
        keys.push(trackKey(tracks[index]))
    }
    return keys
}

export function mergeSelectedKeys(
    current: ReadonlySet<string>,
    nextKeys: readonly string[]
): Set<string> {
    const merged = new Set(current)
    for (const key of nextKeys) {
        merged.add(key)
    }
    return merged
}

export function toggleKey(current: ReadonlySet<string>, key: string): Set<string> {
    const next = new Set(current)
    if (next.has(key)) {
        next.delete(key)
    } else {
        next.add(key)
    }
    return next
}

export function allTrackKeys(tracks: readonly Track[]): string[] {
    return tracks.map((track) => trackKey(track))
}

export function setKeyChecked(
    current: ReadonlySet<string>,
    key: string,
    checked: boolean
): Set<string> {
    const next = new Set(current)
    if (checked) {
        next.add(key)
    } else {
        next.delete(key)
    }
    return next
}

export function applyRangeChecked(
    base: ReadonlySet<string>,
    tracks: readonly Track[],
    fromIndex: number,
    toIndex: number,
    checked: boolean
): Set<string> {
    const next = new Set(base)
    if (tracks.length === 0) {
        return next
    }
    const start = Math.max(0, Math.min(fromIndex, toIndex))
    const end = Math.min(tracks.length - 1, Math.max(fromIndex, toIndex))
    for (let index = start; index <= end; index += 1) {
        const key = trackKey(tracks[index])
        if (checked) {
            next.add(key)
        } else {
            next.delete(key)
        }
    }
    return next
}
