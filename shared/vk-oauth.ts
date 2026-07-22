import type { AuthResult, LoginPayload } from './types'
import { isRecord, parseJsonUnknown, readNumber, readString } from './guards'

export type PasswordTokenSuccess = {
    token: string
    userId: number
}

export type PasswordTokenResult = PasswordTokenSuccess | AuthResult

export const KATE_CLIENT_ID = '2685278'
export const KATE_CLIENT_SECRET = 'lxhD8OD7dMsqtXIm5IUY'
export const KATE_API_VERSION = '5.95'
export const KATE_SCOPE = 'audio,offline'
export const KATE_REDIRECT_URI = 'https://oauth.vk.com/blank.html'
export const KATE_USER_AGENT =
    'KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)'

export const OFFICIAL_CLIENT_ID = '2274003'
export const OFFICIAL_CLIENT_SECRET = 'hHbZxrka2uZ6jB1inYsH'
export const OFFICIAL_API_VERSION = '5.131'
export const OFFICIAL_SCOPE = 'audio,offline'
export const OFFICIAL_USER_AGENT =
    'VKAndroidApp/5.52-4543 (Android 5.1.1; SDK 22; x86_64; unknown Android SDK built for x86_64; en; 320x240)'

export const WEB_APP_ID = '6287487'
export const WEB_API_VERSION = '5.282'
export const WEB_API_HOST = 'https://api.vk.ru'
export const WEB_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
export const WEB_TOKEN_URL = 'https://login.vk.ru/?act=web_token'

export function twoFactorQuery(code: string | undefined): string {
    if (code === undefined || code.length === 0) {
        return ''
    }
    if (code === 'GET_CODE') {
        return '&2fa_supported=1&force_sms=1'
    }
    return `&2fa_supported=1&force_sms=1&code=${encodeURIComponent(code)}`
}

export function buildKateTokenUrl(
    payload: LoginPayload,
    clientId: string,
    clientSecret: string,
    apiVersion: string,
    scope: string
): string {
    const base =
        `https://oauth.vk.com/token?grant_type=password` +
        `&client_id=${clientId}` +
        `&client_secret=${clientSecret}` +
        `&username=${encodeURIComponent(payload.login)}` +
        `&password=${encodeURIComponent(payload.password)}` +
        `&v=${apiVersion}&scope=${encodeURIComponent(scope)}` +
        twoFactorQuery(payload.code)

    if (payload.captchaSid && payload.captchaKey) {
        return (
            base +
            `&captcha_sid=${encodeURIComponent(payload.captchaSid)}` +
            `&captcha_key=${encodeURIComponent(payload.captchaKey)}`
        )
    }
    return base
}

export function buildKateAuthorizeUrl(): string {
    return (
        `https://oauth.vk.com/authorize` +
        `?client_id=${KATE_CLIENT_ID}` +
        `&display=mobile` +
        `&redirect_uri=${encodeURIComponent(KATE_REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(KATE_SCOPE)}` +
        `&response_type=token` +
        `&v=${KATE_API_VERSION}` +
        `&revoke=1`
    )
}

export function buildOfficialAuthorizeUrl(): string {
    return (
        `https://oauth.vk.com/authorize` +
        `?client_id=${OFFICIAL_CLIENT_ID}` +
        `&display=mobile` +
        `&redirect_uri=${encodeURIComponent(KATE_REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(OFFICIAL_SCOPE)}` +
        `&response_type=token` +
        `&v=${OFFICIAL_API_VERSION}` +
        `&revoke=1`
    )
}

export function parseImplicitRedirectUrl(
    url: string
): PasswordTokenSuccess | AuthResult | undefined {
    if (!url.includes('oauth.vk.com/blank.html') && !url.includes('oauth.vk.ru/blank.html')) {
        return undefined
    }

    const hashIndex = url.indexOf('#')
    if (hashIndex < 0) {
        return undefined
    }

    const params = new URLSearchParams(url.slice(hashIndex + 1))
    const error = params.get('error')
    if (error !== null) {
        return {
            ok: false,
            error: params.get('error_description') ?? error
        }
    }

    const token = params.get('access_token')
    const userIdRaw = params.get('user_id')
    if (token === null || userIdRaw === null) {
        return undefined
    }

    const userId = Number(userIdRaw)
    if (!Number.isFinite(userId)) {
        return { ok: false, error: 'Некорректный user_id в OAuth redirect' }
    }

    return { token, userId }
}

export function isPasswordFloodError(message: string): boolean {
    const normalized = message.toLowerCase()
    return (
        normalized.includes('too many attempts') ||
        normalized.includes('too many tries') ||
        normalized.includes('flood') ||
        normalized.includes('слишком много') ||
        normalized.includes('password_bruteforce') ||
        normalized.startsWith('9;')
    )
}

export function humanizeAuthError(message: string): string {
    if (isPasswordFloodError(message)) {
        return (
            'VK отклонил password-grant (flood control). ' +
            'Повторяем вход через официальную OAuth-форму Kate Mobile в окне браузера.'
        )
    }
    return message
}

export function parsePasswordTokenResponse(text: string): PasswordTokenResult {
    const data = parseJsonUnknown(text)
    if (!isRecord(data)) {
        return { ok: false, error: 'Некорректный ответ авторизации VK' }
    }

    const rawError = readString(data.error)
    if (rawError !== undefined && isPasswordFloodError(rawError)) {
        return {
            ok: false,
            error: humanizeAuthError(rawError)
        }
    }

    const errorType = readString(data.error_type)
    if (errorType !== undefined && isPasswordFloodError(errorType)) {
        return {
            ok: false,
            error: humanizeAuthError(errorType)
        }
    }

    if (data.error === 'need_validation') {
        return {
            ok: false,
            need2fa: true,
            phoneMask: readString(data.phone_mask),
            validationType: readString(data.validation_type)
        }
    }

    if (data.error === 'need_captcha') {
        return {
            ok: false,
            needCaptcha: true,
            captchaSid: readString(data.captcha_sid) ?? '',
            captchaImg: readString(data.captcha_img) ?? ''
        }
    }

    const token = readString(data.access_token)
    const userId = readNumber(data.user_id)
    if (token === undefined || userId === undefined) {
        const description =
            readString(data.error_description) ??
            readString(data.error) ??
            'Не удалось получить токен'
        return { ok: false, error: humanizeAuthError(description) }
    }

    return { token, userId }
}

export function parseRefreshTokenResponse(
    text: string,
    previousToken: string
): { ok: true; token: string } | { ok: false; error: string } {
    const data = parseJsonUnknown(text)
    if (!isRecord(data)) {
        return { ok: false, error: 'Некорректный ответ refreshToken' }
    }

    const response = data.response
    if (!isRecord(response)) {
        const error = data.error
        if (isRecord(error)) {
            return {
                ok: false,
                error: readString(error.error_msg) ?? 'Не удалось обновить audio-токен'
            }
        }
        return { ok: false, error: 'Не удалось обновить audio-токен' }
    }

    const token = readString(response.token)
    if (token === undefined || token === previousToken) {
        return { ok: false, error: 'Не удалось обновить audio-токен' }
    }
    return { ok: true, token }
}

export function parseGcmReceipt(text: string): string | undefined {
    const parts = text.split('|ID|1|:')
    const receipt = parts[1]?.trim()
    if (receipt === undefined || receipt.length === 0 || receipt === 'PHONE_REGISTRATION_ERROR') {
        return undefined
    }
    return receipt
}
