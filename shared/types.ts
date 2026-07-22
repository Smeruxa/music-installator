export interface Track {
    id: number
    ownerId: number
    artist: string
    title: string
    duration: number
    url: string
    accessKey?: string
}

export interface LibraryPayload {
    recent: Track[]
    myMusic: Track[]
}

export interface SessionInfo {
    userId: number
    loggedIn: boolean
}

export type AuthSuccess = {
    ok: true
    userId: number
}

export type AuthNeed2fa = {
    ok: false
    need2fa: true
    phoneMask?: string
    validationType?: string
}

export type AuthNeedCaptcha = {
    ok: false
    needCaptcha: true
    captchaSid: string
    captchaImg: string
}

export type AuthError = {
    ok: false
    error: string
}

export type AuthResult = AuthSuccess | AuthNeed2fa | AuthNeedCaptcha | AuthError

export interface LoginPayload {
    login: string
    password: string
    code?: string
    captchaSid?: string
    captchaKey?: string
}

export interface TokenLoginPayload {
    token: string
    userId?: number
}

export interface AudioFetchProgress {
    loaded: number
    total: number | null
}

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error'

export interface DownloadProgress {
    trackKey: string
    status: DownloadStatus
    completed: number
    total: number
    error?: string
    fileName?: string
}

export interface DownloadStartPayload {
    trackKeys: string[]
    directory: string
}

export interface VkSession {
    token: string
    userAgent: string
    userId: number
    audioRefreshed?: boolean
    client?: 'kate' | 'official' | 'web'
    clientId?: string
    apiVersion?: string
    cookieP?: string
    cookieRemixsid?: string
    tokenExpiresAt?: number
}
