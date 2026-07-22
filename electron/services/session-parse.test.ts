import { describe, expect, it } from 'vitest'
import { parsePersistedShape } from './session-parse'
import { writeVarint } from './kate-proto'

describe('session-parse', () => {
    it('parses persisted shape', () => {
        expect(
            parsePersistedShape(
                JSON.stringify({
                    encryptedSession: 'abc',
                    downloadDirectory: '/tmp/music',
                    extra: 1
                })
            )
        ).toEqual({
            encryptedSession: 'abc',
            downloadDirectory: '/tmp/music'
        })
        expect(parsePersistedShape('{')).toEqual({})
        expect(parsePersistedShape('[]')).toEqual({})
    })
})

describe('kate-proto', () => {
    it('writes varints', () => {
        expect(writeVarint(0)).toEqual(Buffer.from([0]))
        expect(writeVarint(127)).toEqual(Buffer.from([127]))
        expect(writeVarint(128)).toEqual(Buffer.from([0x80, 0x01]))
    })
})
