import { BrowserWindow, session, type Session } from 'electron'
import type { AuthResult, LoginPayload, VkSession } from '../../shared/types'
import {
    WEB_API_VERSION,
    WEB_APP_ID,
    WEB_TOKEN_URL,
    WEB_USER_AGENT
} from '../../shared/vk-oauth'
import { isRecord, parseJsonUnknown, readNumber, readString } from '../../shared/guards'
import { nodeHttpText } from './node-http'
import { logInfo, logWarn } from './logger'

const AUTH_TIMEOUT_MS = 5 * 60 * 1000
const LOGIN_URL = 'https://m.vk.com/login'

type WebCookies = {
    p?: string
    remixsid: string
}

function isLoggedInUrl(url: string): boolean {
    const normalized = url.toLowerCase()
    return (
        normalized.includes('/feed') ||
        normalized.includes('/id') ||
        normalized.includes('act=slogin') ||
        (normalized.includes('vk.ru/') && !normalized.includes('login') && !normalized.includes('id.vk')) ||
        (normalized.includes('vk.com/') &&
            !normalized.includes('login') &&
            !normalized.includes('id.vk') &&
            !normalized.includes('oauth'))
    )
}

function buildAutofillScript(login: string, password: string): string {
    const loginJson = JSON.stringify(login)
    const passwordJson = JSON.stringify(password)
    return `(() => {
        const loginValue = ${loginJson};
        const passwordValue = ${passwordJson};

        function fillInput(el, value) {
            if (!el) return false;
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            return true;
        }

        const email =
            document.querySelector('input[name="email"]') ||
            document.querySelector('input[name="login"]') ||
            document.querySelector('input[type="email"]') ||
            document.querySelector('input[type="tel"]') ||
            document.querySelector('input[name="username"]') ||
            document.querySelector('input[autocomplete="username"]') ||
            document.querySelector('input[inputmode="tel"]') ||
            document.querySelector('input[inputmode="email"]');
        const pass =
            document.querySelector('input[name="pass"]') ||
            document.querySelector('input[type="password"]') ||
            document.querySelector('input[autocomplete="current-password"]');

        const filledEmail = fillInput(email, loginValue);
        const filledPass = fillInput(pass, passwordValue);
        if (!filledEmail || !filledPass) {
            return 'waiting';
        }

        const submit =
            document.querySelector('button[type="submit"]') ||
            document.querySelector('input[type="submit"]') ||
            document.querySelector('[data-testid="submit"]') ||
            document.querySelector('button.flat_button') ||
            document.querySelector('button[class*="submit"]');

        if (submit instanceof HTMLElement) {
            submit.click();
            return 'submitted';
        }

        const form = (email && email.closest('form')) || (pass && pass.closest('form'));
        if (form) {
            form.submit();
            return 'submitted';
        }

        return 'filled';
    })()`
}

async function readWebCookies(authSession: Session): Promise<WebCookies | undefined> {
    const all = await authSession.cookies.get({})
    const byName = new Map<string, string>()
    for (const cookie of all) {
        byName.set(cookie.name, cookie.value)
    }

    const remixsid =
        byName.get('remixsid') ??
        byName.get('remixsid_legacy') ??
        byName.get('remixnsid') ??
        byName.get('remixsid_synced')

    const p = byName.get('p') ?? byName.get('remixp')

    if (remixsid === undefined || remixsid.length < 10) {
        return undefined
    }

    return { p, remixsid }
}

function buildCookieHeader(cookies: WebCookies): string {
    const parts = [`remixsid=${cookies.remixsid}`]
    if (cookies.p !== undefined && cookies.p.length > 0) {
        parts.unshift(`p=${cookies.p}`)
    }
    return parts.join('; ')
}

async function exchangeWebToken(cookies: WebCookies): Promise<VkSession> {
    const endpoints = [WEB_TOKEN_URL, 'https://login.vk.com/?act=web_token']
    let lastError = 'Не удалось получить web_token'

    for (const endpoint of endpoints) {
        const text = await nodeHttpText(endpoint, {
            method: 'POST',
            headers: {
                'User-Agent': WEB_USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
                Origin: 'https://vk.ru',
                Referer: 'https://vk.ru/',
                Cookie: buildCookieHeader(cookies)
            },
            body: new URLSearchParams({
                version: '1',
                app_id: WEB_APP_ID
            }).toString()
        })

        logInfo('vk-web-auth', 'web_token response', {
            endpoint,
            snip: text.slice(0, 200)
        })

        const data = parseJsonUnknown(text)
        if (!isRecord(data)) {
            lastError = 'Некорректный ответ web_token'
            continue
        }
        if (data.type === 'error') {
            lastError = readString(data.error_info) ?? 'Не удалось получить web_token'
            continue
        }

        const payload = isRecord(data.data) ? data.data : undefined
        if (payload === undefined) {
            lastError = 'web_token без data'
            continue
        }

        const token = readString(payload.access_token)
        const userId = readNumber(payload.user_id)
        const expires = readNumber(payload.expires) ?? 0
        if (token === undefined || userId === undefined) {
            lastError = 'web_token без access_token/user_id'
            continue
        }

        return {
            token,
            userAgent: WEB_USER_AGENT,
            userId,
            audioRefreshed: true,
            client: 'web',
            clientId: WEB_APP_ID,
            apiVersion: WEB_API_VERSION,
            cookieP: cookies.p,
            cookieRemixsid: cookies.remixsid,
            tokenExpiresAt: expires > 1_000_000_000_000 ? expires : expires * 1000
        }
    }

    throw new Error(lastError)
}

export async function loginViaVkWebCookies(
    payload: LoginPayload,
    parent: BrowserWindow | null
): Promise<AuthResult | { session: VkSession }> {
    const partition = `vk-web-${Date.now()}`
    const authSession = session.fromPartition(partition, { cache: false })

    const win = new BrowserWindow({
        width: 520,
        height: 760,
        parent: parent ?? undefined,
        modal: parent !== null,
        show: false,
        autoHideMenuBar: true,
        title: 'Войдите во VK в этом окне',
        backgroundColor: '#ffffff',
        webPreferences: {
            session: authSession,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    })

    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) {
            win.show()
            win.focus()
        }
    })

    win.webContents.setWindowOpenHandler((details) => {
        void win.loadURL(details.url)
        return { action: 'deny' }
    })

    let settled = false
    let autofillAttempts = 0
    let exchanging = false
    let loggedCookieDump = false

    return await new Promise<AuthResult | { session: VkSession }>((resolve) => {
        const finish = (result: AuthResult | { session: VkSession }): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timeout)
            clearInterval(poll)
            if (!win.isDestroyed()) {
                win.destroy()
            }
            resolve(result)
        }

        const timeout = setTimeout(() => {
            finish({
                ok: false,
                error:
                    'Таймаут входа. Войдите вручную в окне VK до ленты (/feed), затем подождите пару секунд.'
            })
        }, AUTH_TIMEOUT_MS)

        const tryExchange = async (reason: string): Promise<boolean> => {
            if (exchanging || settled) {
                return false
            }

            const all = await authSession.cookies.get({})
            const cookies = await readWebCookies(authSession)
            if (cookies === undefined) {
                if (!loggedCookieDump && all.length > 0) {
                    loggedCookieDump = true
                    logInfo('vk-web-auth', 'cookies present but remixsid missing', {
                        reason,
                        names: all.map((cookie) => `${cookie.name}@${cookie.domain}`)
                    })
                }
                return false
            }

            exchanging = true
            logInfo('vk-web-auth', 'cookies captured, exchanging web_token', {
                reason,
                hasP: cookies.p !== undefined,
                remixPrefix: cookies.remixsid.slice(0, 8)
            })
            try {
                const sessionData = await exchangeWebToken(cookies)
                logInfo('vk-web-auth', 'web_token ok', {
                    userId: sessionData.userId,
                    tokenPrefix: sessionData.token.slice(0, 8)
                })
                finish({ session: sessionData })
                return true
            } catch (err: unknown) {
                exchanging = false
                logWarn('vk-web-auth', 'web_token exchange failed', err)
                return false
            }
        }

        const poll = setInterval(() => {
            void tryExchange('poll')
        }, 1000)

        win.on('closed', () => {
            finish({ ok: false, error: 'Окно входа закрыто' })
        })

        win.webContents.on('did-navigate', (_event, url) => {
            logInfo('vk-web-auth', 'navigated', { url: url.slice(0, 180) })
            if (isLoggedInUrl(url)) {
                void tryExchange('navigated-logged-in')
            } else {
                void tryExchange('navigated')
            }
        })

        win.webContents.on('did-navigate-in-page', (_event, url) => {
            void tryExchange(isLoggedInUrl(url) ? 'in-page-logged-in' : 'in-page')
        })

        win.webContents.on('did-finish-load', () => {
            const currentUrl = win.webContents.getURL()
            void tryExchange(isLoggedInUrl(currentUrl) ? 'loaded-logged-in' : 'loaded')

            if (isLoggedInUrl(currentUrl)) {
                return
            }
            if (autofillAttempts >= 12) {
                return
            }
            autofillAttempts += 1
            void win.webContents
                .executeJavaScript(buildAutofillScript(payload.login, payload.password), true)
                .then((status: unknown) => {
                    logInfo('vk-web-auth', 'autofill', { status, attempt: autofillAttempts })
                })
                .catch((err: unknown) => {
                    logWarn('vk-web-auth', 'autofill failed', err)
                })
        })

        logInfo('vk-web-auth', 'open mobile login page')
        void win.loadURL(LOGIN_URL).catch((err: unknown) => {
            logWarn('vk-web-auth', 'loadURL failed', err)
            finish({ ok: false, error: 'Не удалось открыть страницу входа VK' })
        })
    })
}

export async function refreshWebSession(sessionData: VkSession): Promise<VkSession | undefined> {
    if (
        sessionData.cookieRemixsid === undefined ||
        sessionData.cookieRemixsid.length === 0
    ) {
        return undefined
    }
    return await exchangeWebToken({
        p: sessionData.cookieP,
        remixsid: sessionData.cookieRemixsid
    })
}
