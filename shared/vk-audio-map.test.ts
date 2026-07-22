import { describe, expect, it } from 'vitest'
import {
    extractMusicAudioBlocks,
    findMyMusicSectionId,
    indexAudiosByKey,
    mapVkAudioItem,
    parseAudioGetByIdResponse,
    parseAudioGetResponse,
    parseVkAudioItem,
    pickAudiosByIds,
    pickMyMusicBlock,
    pickRecentBlock
} from './vk-audio-map'

describe('vk-audio-map', () => {
    it('maps audio item with defaults', () => {
        expect(
            mapVkAudioItem({
                id: 9,
                owner_id: 3,
                artist: '  A  ',
                title: '  T  ',
                duration: 11,
                url: 'u',
                access_key: 'k'
            })
        ).toEqual({
            id: 9,
            ownerId: 3,
            artist: 'A',
            title: 'T',
            duration: 11,
            url: 'u',
            accessKey: 'k'
        })

        expect(mapVkAudioItem({ id: 1, owner_id: 2 })).toEqual({
            id: 1,
            ownerId: 2,
            artist: 'Unknown',
            title: 'Untitled',
            duration: 0,
            url: '',
            accessKey: undefined
        })
    })

    it('parses raw audio items and main_artists', () => {
        expect(parseVkAudioItem({ id: 1, owner_id: 2, title: 'x' })).toEqual({
            id: 1,
            owner_id: 2,
            title: 'x'
        })
        expect(
            parseVkAudioItem({
                id: 1,
                owner_id: 2,
                title: 'Song',
                main_artists: [{ name: 'Artist A' }, { name: 'Artist B' }]
            })
        ).toEqual({
            id: 1,
            owner_id: 2,
            title: 'Song',
            artist: 'Artist A, Artist B'
        })
        expect(parseVkAudioItem({ id: 'x' })).toBeUndefined()
    })

    it('parses audio.get payload', () => {
        const parsed = parseAudioGetResponse({
            count: 2,
            items: [{ id: 1, owner_id: 2 }, { bad: true }, { id: 3, owner_id: 4, url: 'u' }]
        })
        expect(parsed).toEqual({
            count: 2,
            items: [
                { id: 1, owner_id: 2 },
                { id: 3, owner_id: 4, url: 'u' }
            ]
        })
        expect(parseAudioGetResponse(null)).toBeUndefined()
    })

    it('parses audio.getById payload', () => {
        expect(parseAudioGetByIdResponse([{ id: 1, owner_id: 2 }, { nope: true }])).toEqual([
            { id: 1, owner_id: 2 }
        ])
        expect(parseAudioGetByIdResponse({})).toEqual([])
    })

    it('picks my music section and excludes recent block', () => {
        const sectionId = findMyMusicSectionId(
            {
                catalog: {
                    default_section: 'overview',
                    sections: [
                        { id: 'overview', title: 'Обзор', url: 'https://vk.com/audio' },
                        {
                            id: 'mine',
                            title: 'Моя музыка',
                            url: 'https://vk.com/audios332'
                        }
                    ]
                }
            },
            332
        )
        expect(sectionId).toBe('mine')

        const blocks = extractMusicAudioBlocks({
            section: {
                blocks: [
                    {
                        data_type: 'music_audios',
                        url: 'https://vk.com/audio?block=recent',
                        title: 'Недавно прослушанные',
                        audios_ids: ['1_1'],
                        next_from: 'r1'
                    },
                    {
                        data_type: 'music_audios',
                        url: 'https://vk.com/audios332',
                        audios_ids: ['1_2', '1_3'],
                        next_from: 'm1'
                    }
                ]
            },
            audios: [
                { id: 1, owner_id: 1, title: 'Recent', artist: 'R' },
                { id: 2, owner_id: 1, title: 'Mine', artist: 'A' },
                { id: 3, owner_id: 1, title: 'Mine2', main_artists: [{ name: 'B' }] }
            ]
        })
        const myBlock = pickMyMusicBlock(blocks)
        expect(myBlock?.isRecent).toBe(false)
        expect(myBlock?.audioIds).toEqual(['1_2', '1_3'])
        const recentBlock = pickRecentBlock(blocks)
        expect(recentBlock?.isRecent).toBe(true)
        expect(recentBlock?.audioIds).toEqual(['1_1'])
        const index = indexAudiosByKey({
            audios: [
                { id: 2, owner_id: 1, title: 'Mine', artist: 'A' },
                { id: 3, owner_id: 1, title: 'Mine2', main_artists: [{ name: 'B' }] }
            ]
        })
        expect(pickAudiosByIds(index, myBlock?.audioIds ?? [])).toEqual([
            { id: 2, owner_id: 1, title: 'Mine', artist: 'A' },
            { id: 3, owner_id: 1, title: 'Mine2', artist: 'B' }
        ])
    })
})
