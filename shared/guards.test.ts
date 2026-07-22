import { describe, expect, it } from 'vitest'
import {
    isAuthError,
    isAuthNeed2fa,
    isAuthNeedCaptcha,
    isAuthSuccess,
    isRecord,
    isTrack,
    isVkSession,
    parseJsonUnknown,
    readNumber,
    readString
} from './guards'
import type { AuthResult } from './types'

describe('guards', () => {
    it('checks records and primitives', () => {
        expect(isRecord({})).toBe(true)
        expect(isRecord([])).toBe(false)
        expect(isRecord(null)).toBe(false)
        expect(readString('x')).toBe('x')
        expect(readString(1)).toBeUndefined()
        expect(readNumber(3)).toBe(3)
        expect(readNumber(Number.NaN)).toBeUndefined()
    })

    it('parses json safely', () => {
        expect(parseJsonUnknown('{"a":1}')).toEqual({ a: 1 })
        expect(parseJsonUnknown('{')).toBeUndefined()
    })

    it('validates session and track', () => {
        expect(isVkSession({ token: 't', userAgent: 'ua', userId: 1 })).toBe(true)
        expect(isVkSession({ token: 't' })).toBe(false)
        expect(
            isTrack({
                id: 1,
                ownerId: 2,
                artist: 'a',
                title: 't',
                duration: 1,
                url: 'u'
            })
        ).toBe(true)
        expect(isTrack({ id: 1 })).toBe(false)
    })

    it('narrows auth results', () => {
        const success: AuthResult = { ok: true, userId: 1 }
        const twofa: AuthResult = { ok: false, need2fa: true, phoneMask: '+7*' }
        const captcha: AuthResult = {
            ok: false,
            needCaptcha: true,
            captchaSid: 's',
            captchaImg: 'i'
        }
        const error: AuthResult = { ok: false, error: 'e' }

        expect(isAuthSuccess(success)).toBe(true)
        expect(isAuthNeed2fa(twofa)).toBe(true)
        expect(isAuthNeedCaptcha(captcha)).toBe(true)
        expect(isAuthError(error)).toBe(true)
        expect(isAuthNeed2fa(error)).toBe(false)
    })
})
