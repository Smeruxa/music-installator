import type { BrowserWindow } from 'electron'
import type { AuthResult, LoginPayload, TokenLoginPayload, VkSession } from '../../shared/types'
import {
    KATE_USER_AGENT,
    OFFICIAL_USER_AGENT,
    WEB_API_VERSION,
    WEB_APP_ID,
    WEB_USER_AGENT
} from '../../shared/vk-oauth'
import { isRecord, parseJsonUnknown, readNumber } from '../../shared/guards'
import { nodeHttpText } from './node-http'
import { loginViaVkWebCookies } from './vk-web-auth'
import { logInfo } from './logger'

export type { VkSession }

export { KATE_USER_AGENT }

async function resolveUserId(token: string, userAgent: string): Promise<number | undefined> {
    const url =
        `https://api.vk.ru/method/users.get?access_token=${encodeURIComponent(token)}` +
        `&v=${WEB_API_VERSION}`
    const text = await nodeHttpText(url, {
        method: 'GET',
        headers: {
            'User-Agent': userAgent,
            Accept: 'application/json'
        }
    })
    const data = parseJsonUnknown(text)
    if (!isRecord(data) || !Array.isArray(data.response) || data.response.length === 0) {
        return undefined
    }
    const first = data.response[0]
    if (!isRecord(first)) {
        return undefined
    }
    return readNumber(first.id)
}

export async function loginWithKate(
    payload: LoginPayload,
    parentWindow: BrowserWindow | null = null
): Promise<AuthResult | { session: VkSession }> {
    logInfo('vk-auth', 'login via VK web cookies (Kate/OAuth audio API is dead)')
    return await loginViaVkWebCookies(payload, parentWindow)
}

export async function loginWithToken(
    payload: TokenLoginPayload
): Promise<AuthResult | { session: VkSession }> {
    const token = payload.token.trim()
    if (token.length < 20) {
        return { ok: false, error: 'Токен слишком короткий' }
    }

    const userAgents = [WEB_USER_AGENT, KATE_USER_AGENT, OFFICIAL_USER_AGENT]
    let userId = payload.userId
    let usedUa = WEB_USER_AGENT
    if (userId === undefined) {
        for (const ua of userAgents) {
            userId = await resolveUserId(token, ua)
            if (userId !== undefined) {
                usedUa = ua
                break
            }
        }
    }

    if (userId === undefined) {
        return {
            ok: false,
            error: 'Не удалось проверить токен. Укажите userId или вставьте валидный VK token.'
        }
    }

    logInfo('vk-auth', 'token login as web-compatible session', {
        userId,
        tokenPrefix: token.slice(0, 8)
    })

    return {
        session: {
            token,
            userAgent: usedUa,
            userId,
            audioRefreshed: true,
            client: usedUa === WEB_USER_AGENT ? 'web' : 'kate',
            clientId: WEB_APP_ID,
            apiVersion: WEB_API_VERSION
        }
    }
}
