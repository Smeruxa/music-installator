import { describe, expect, it } from 'vitest'
import {
    buildTrackFileBase,
    formatDuration,
    isHlsUrl,
    nextAvailableFileName,
    sanitizeFileName
} from '../shared/files'
import {
    applyRangeChecked,
    allTrackKeys,
    mergeSelectedKeys,
    selectNearestKeys,
    setKeyChecked,
    toggleKey,
    trackKey
} from '../shared/selection'
import { firstVisibleIndexFromScroll } from '../shared/viewport'
import type { Track } from '../shared/types'

function makeTrack(id: number, ownerId: number = 1): Track {
    return {
        id,
        ownerId,
        artist: `Artist ${id}`,
        title: `Title ${id}`,
        duration: 120,
        url: 'https://example.com/a.mp3'
    }
}

describe('files', () => {
    it('formats duration', () => {
        expect(formatDuration(0)).toBe('0:00')
        expect(formatDuration(65)).toBe('1:05')
        expect(formatDuration(Number.NaN)).toBe('0:00')
    })

    it('sanitizes file names', () => {
        expect(sanitizeFileName('A/B:C*.mp3')).toBe('A_B_C_.mp3')
        expect(sanitizeFileName('  hello   world  ')).toBe('hello world')
    })

    it('builds track file base', () => {
        expect(buildTrackFileBase('ABBA', 'SOS', '1_2')).toBe('ABBA - SOS')
        expect(buildTrackFileBase('A/B', 'C:D', '1_2')).toBe('A_B - C_D')
    })

    it('picks next available file name', () => {
        const existing = new Set(['song.mp3', 'song (2).mp3'])
        expect(nextAvailableFileName(existing, 'song', 'mp3')).toBe('song (3).mp3')
        expect(nextAvailableFileName(new Set(), 'song', 'mp3')).toBe('song.mp3')
    })

    it('detects hls urls', () => {
        expect(isHlsUrl('https://x/index.m3u8')).toBe(true)
        expect(isHlsUrl('https://x/file.mp3')).toBe(false)
    })
})

describe('selection', () => {
    it('builds track key', () => {
        expect(trackKey(makeTrack(10, 5))).toBe('5_10')
    })

    it('selects nearest keys from visible index', () => {
        const tracks = [1, 2, 3, 4, 5, 6].map((id) => makeTrack(id))
        expect(selectNearestKeys(tracks, 2, 3)).toEqual(['1_3', '1_4', '1_5'])
        expect(selectNearestKeys(tracks, 4, 15)).toEqual(['1_5', '1_6'])
        expect(selectNearestKeys(tracks, -5, 2)).toEqual(['1_1', '1_2'])
    })

    it('merges and toggles selected keys', () => {
        const current = new Set(['1_1'])
        expect(Array.from(mergeSelectedKeys(current, ['1_2', '1_3'])).sort()).toEqual([
            '1_1',
            '1_2',
            '1_3'
        ])
        expect(Array.from(toggleKey(current, '1_1'))).toEqual([])
        expect(Array.from(toggleKey(current, '1_2')).sort()).toEqual(['1_1', '1_2'])
    })

    it('selects all keys and sets checked state', () => {
        const tracks = [1, 2, 3].map((id) => makeTrack(id))
        expect(allTrackKeys(tracks)).toEqual(['1_1', '1_2', '1_3'])
        expect(Array.from(setKeyChecked(new Set(['1_1']), '1_2', true)).sort()).toEqual([
            '1_1',
            '1_2'
        ])
        expect(Array.from(setKeyChecked(new Set(['1_1', '1_2']), '1_1', false))).toEqual(['1_2'])
    })

    it('applies inclusive range over a selection snapshot', () => {
        const tracks = [1, 2, 3, 4, 5].map((id) => makeTrack(id))
        const base = new Set(['1_1', '1_5'])
        expect(Array.from(applyRangeChecked(base, tracks, 1, 3, true)).sort()).toEqual([
            '1_1',
            '1_2',
            '1_3',
            '1_4',
            '1_5'
        ])
        expect(Array.from(applyRangeChecked(base, tracks, 3, 0, false)).sort()).toEqual(['1_5'])
    })
})

describe('viewport', () => {
    it('maps scroll top to the first visible row, ignoring overscan padding', () => {
        expect(firstVisibleIndexFromScroll(0, 8, 64, 100)).toBe(0)
        expect(firstVisibleIndexFromScroll(8, 8, 64, 100)).toBe(0)
        expect(firstVisibleIndexFromScroll(8 + 64, 8, 64, 100)).toBe(1)
        expect(firstVisibleIndexFromScroll(8 + 64 * 2 + 10, 8, 64, 100)).toBe(2)
        expect(firstVisibleIndexFromScroll(99999, 8, 64, 5)).toBe(4)
    })
})
