import { describe, expect, it } from 'vitest'
import {
    buildKateAuthorizeUrl,
    buildKateTokenUrl,
    buildOfficialAuthorizeUrl,
    parseGcmReceipt,
    parseImplicitRedirectUrl,
    parsePasswordTokenResponse,
    parseRefreshTokenResponse,
    twoFactorQuery,
    humanizeAuthError
} from './vk-oauth'

describe('vk-oauth', () => {
    it('builds two factor query like vodka2', () => {
        expect(twoFactorQuery(undefined)).toBe('')
        expect(twoFactorQuery('')).toBe('')
        expect(twoFactorQuery('GET_CODE')).toBe('&2fa_supported=1&force_sms=1')
        expect(twoFactorQuery('123456')).toBe('&2fa_supported=1&force_sms=1&code=123456')
    })

    it('builds kate token url without forced sms on first login', () => {
        const url = buildKateTokenUrl(
            {
                login: '+7999',
                password: 'secret'
            },
            '2685278',
            'secret',
            '5.95',
            'audio,offline'
        )
        expect(url).toContain('https://oauth.vk.com/token')
        expect(url).toContain('grant_type=password')
        expect(url).toContain('username=%2B7999')
        expect(url).not.toContain('2fa_supported')
        expect(url).not.toContain('device_id=')
        expect(url).not.toContain('force_sms')
        expect(url).not.toContain('GET_CODE')
    })

    it('builds kate token url with captcha and 2fa code', () => {
        const url = buildKateTokenUrl(
            {
                login: '+7999',
                password: 'secret',
                code: '111',
                captchaSid: 'sid',
                captchaKey: 'key'
            },
            '2685278',
            'secret',
            '5.95',
            'audio,offline'
        )
        expect(url).toContain('code=111')
        expect(url).toContain('force_sms=1')
        expect(url).toContain('captcha_sid=sid')
        expect(url).toContain('captcha_key=key')
    })

    it('builds kate authorize url for implicit flow', () => {
        const url = buildKateAuthorizeUrl()
        expect(url).toContain('https://oauth.vk.com/authorize')
        expect(url).toContain('client_id=2685278')
        expect(url).toContain('response_type=token')
        expect(url).toContain('redirect_uri=')
        expect(url).toContain('blank.html')
    })

    it('builds official android authorize url', () => {
        const url = buildOfficialAuthorizeUrl()
        expect(url).toContain('client_id=2274003')
        expect(url).toContain('response_type=token')
        expect(url).toContain('v=5.131')
    })

    it('parses implicit redirect hash', () => {
        expect(
            parseImplicitRedirectUrl(
                'https://oauth.vk.com/blank.html#access_token=tok&expires_in=0&user_id=42'
            )
        ).toEqual({ token: 'tok', userId: 42 })
        expect(
            parseImplicitRedirectUrl(
                'https://oauth.vk.com/blank.html#error=access_denied&error_description=nope'
            )
        ).toEqual({ ok: false, error: 'nope' })
        expect(parseImplicitRedirectUrl('https://example.com')).toBeUndefined()
    })

    it('parses password token success', () => {
        const result = parsePasswordTokenResponse(
            JSON.stringify({ access_token: 'tok', user_id: 42 })
        )
        expect(result).toEqual({ token: 'tok', userId: 42 })
    })

    it('parses need_validation as 2fa', () => {
        const result = parsePasswordTokenResponse(
            JSON.stringify({
                error: 'need_validation',
                phone_mask: '+7 ***',
                validation_type: '2fa_app'
            })
        )
        expect(result).toEqual({
            ok: false,
            need2fa: true,
            phoneMask: '+7 ***',
            validationType: '2fa_app'
        })
    })

    it('parses need_captcha', () => {
        const result = parsePasswordTokenResponse(
            JSON.stringify({
                error: 'need_captcha',
                captcha_sid: '1',
                captcha_img: 'https://img'
            })
        )
        expect(result).toEqual({
            ok: false,
            needCaptcha: true,
            captchaSid: '1',
            captchaImg: 'https://img'
        })
    })

    it('parses invalid json and auth errors', () => {
        expect(parsePasswordTokenResponse('{')).toEqual({
            ok: false,
            error: 'Некорректный ответ авторизации VK'
        })
        expect(
            parsePasswordTokenResponse(
                JSON.stringify({ error: 'invalid_client', error_description: 'bad' })
            )
        ).toEqual({ ok: false, error: 'bad' })
    })

    it('humanizes password flood errors', () => {
        const result = parsePasswordTokenResponse(
            JSON.stringify({
                error: 'too_many_tries',
                error_description:
                    'Too many attempts were made to sign in to this account with a password.'
            })
        )
        expect('ok' in result && result.ok === false && 'error' in result).toBe(true)
        if ('ok' in result && result.ok === false && 'error' in result) {
            expect(result.error).toContain('password-grant')
        }
        expect(
            humanizeAuthError(
                'Too many attempts were made to sign in to this account with a password.'
            )
        ).toContain('password-grant')
    })

    it('parses refresh token response', () => {
        expect(
            parseRefreshTokenResponse(JSON.stringify({ response: { token: 'new' } }), 'old')
        ).toEqual({ ok: true, token: 'new' })
        expect(
            parseRefreshTokenResponse(JSON.stringify({ response: { token: 'old' } }), 'old')
        ).toEqual({ ok: false, error: 'Не удалось обновить audio-токен' })
    })

    it('parses gcm receipt', () => {
        expect(parseGcmReceipt('|ID|1|:abc')).toBe('abc')
        expect(parseGcmReceipt('|ID|1|:PHONE_REGISTRATION_ERROR')).toBeUndefined()
        expect(parseGcmReceipt('broken')).toBeUndefined()
    })
})
