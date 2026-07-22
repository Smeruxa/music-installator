import type {
    AuthError,
    AuthNeed2fa,
    AuthNeedCaptcha,
    AuthResult,
    AuthSuccess,
    Track,
    VkSession
} from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

export function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function parseJsonUnknown(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

export function isVkSession(value: unknown): value is VkSession {
    if (!isRecord(value)) {
        return false
    }
    return (
        typeof value.token === 'string' &&
        typeof value.userAgent === 'string' &&
        typeof value.userId === 'number'
    )
}

export function isTrack(value: unknown): value is Track {
    if (!isRecord(value)) {
        return false
    }
    return (
        typeof value.id === 'number' &&
        typeof value.ownerId === 'number' &&
        typeof value.artist === 'string' &&
        typeof value.title === 'string' &&
        typeof value.duration === 'number' &&
        typeof value.url === 'string'
    )
}

export function isAuthSuccess(value: AuthResult): value is AuthSuccess {
    return value.ok === true
}

export function isAuthNeed2fa(value: AuthResult): value is AuthNeed2fa {
    return value.ok === false && 'need2fa' in value && value.need2fa === true
}

export function isAuthNeedCaptcha(value: AuthResult): value is AuthNeedCaptcha {
    return value.ok === false && 'needCaptcha' in value && value.needCaptcha === true
}

export function isAuthError(value: AuthResult): value is AuthError {
    return value.ok === false && 'error' in value
}
