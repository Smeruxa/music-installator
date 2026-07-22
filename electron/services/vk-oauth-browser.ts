import { BrowserWindow, session } from 'electron'
import type { AuthResult, LoginPayload } from '../../shared/types'
import {
    buildKateAuthorizeUrl,
    parseImplicitRedirectUrl,
    type PasswordTokenSuccess
} from '../../shared/vk-oauth'
import { logInfo, logWarn } from './logger'

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

function buildAutofillScript(login: string, password: string): string {
    const loginJson = JSON.stringify(login)
    const passwordJson = JSON.stringify(password)
    return `(() => {
        const loginValue = ${loginJson};
        const passwordValue = ${passwordJson};

        function fillInput(el, value) {
            if (!el) return false;
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        const email =
            document.querySelector('input[name="email"]') ||
            document.querySelector('input[name="login"]') ||
            document.querySelector('input[type="email"]') ||
            document.querySelector('input[type="tel"]') ||
            document.querySelector('input[name="username"]');
        const pass =
            document.querySelector('input[name="pass"]') ||
            document.querySelector('input[type="password"]');

        const filledEmail = fillInput(email, loginValue);
        const filledPass = fillInput(pass, passwordValue);
        if (!filledEmail || !filledPass) {
            return 'waiting';
        }

        const submit =
            document.querySelector('button[type="submit"]') ||
            document.querySelector('input[type="submit"]') ||
            document.querySelector('button.flat_button') ||
            document.querySelector('[data-test-id="submit"]');

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

export async function loginViaKateBrowserOAuth(
    payload: LoginPayload,
    parent: BrowserWindow | null
): Promise<PasswordTokenSuccess | AuthResult> {
    const partition = `vk-oauth-${Date.now()}`
    const authSession = session.fromPartition(partition, { cache: false })

    const win = new BrowserWindow({
        width: 480,
        height: 720,
        parent: parent ?? undefined,
        modal: parent !== null,
        show: false,
        autoHideMenuBar: true,
        title: 'Вход VK · Kate Mobile',
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
        }
    })

    win.webContents.setWindowOpenHandler((details) => {
        logInfo('vk-oauth-browser', 'popup redirected into same window', { url: details.url })
        void win.loadURL(details.url)
        return { action: 'deny' }
    })

    let settled = false
    let autofillAttempts = 0

    return await new Promise<PasswordTokenSuccess | AuthResult>((resolve) => {
        const finish = (result: PasswordTokenSuccess | AuthResult): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timeout)
            if (!win.isDestroyed()) {
                win.destroy()
            }
            resolve(result)
        }

        const timeout = setTimeout(() => {
            finish({ ok: false, error: 'Таймаут OAuth-входа VK' })
        }, AUTH_TIMEOUT_MS)

        const tryParse = (url: string): boolean => {
            const parsed = parseImplicitRedirectUrl(url)
            if (parsed === undefined) {
                return false
            }
            logInfo('vk-oauth-browser', 'token redirect captured', {
                hasToken: !('ok' in parsed),
                userId: 'userId' in parsed ? parsed.userId : undefined
            })
            finish(parsed)
            return true
        }

        win.on('closed', () => {
            finish({ ok: false, error: 'Окно входа закрыто' })
        })

        win.webContents.on('will-redirect', (_event, url) => {
            tryParse(url)
        })

        win.webContents.on('will-navigate', (_event, url) => {
            tryParse(url)
        })

        win.webContents.on('did-navigate', (_event, url) => {
            logInfo('vk-oauth-browser', 'navigated', { url: url.slice(0, 180) })
            tryParse(url)
        })

        win.webContents.on('did-navigate-in-page', (_event, url) => {
            tryParse(url)
        })

        win.webContents.on('did-fail-load', (_event, code, desc, url) => {
            logWarn('vk-oauth-browser', 'did-fail-load', { code, desc, url: url.slice(0, 180) })
        })

        win.webContents.on('did-finish-load', () => {
            const currentUrl = win.webContents.getURL()
            if (tryParse(currentUrl)) {
                return
            }
            if (payload.code !== undefined && payload.code.length > 0) {
                return
            }
            if (autofillAttempts >= 8) {
                return
            }
            autofillAttempts += 1
            void win.webContents
                .executeJavaScript(buildAutofillScript(payload.login, payload.password), true)
                .then((status: unknown) => {
                    logInfo('vk-oauth-browser', 'autofill', { status, attempt: autofillAttempts })
                })
                .catch((err: unknown) => {
                    logWarn('vk-oauth-browser', 'autofill failed', err)
                })
        })

        logInfo('vk-oauth-browser', 'open kate authorize url')
        void win.loadURL(buildKateAuthorizeUrl()).catch((err: unknown) => {
            logWarn('vk-oauth-browser', 'loadURL failed', err)
            finish({ ok: false, error: 'Не удалось открыть страницу авторизации VK' })
        })
    })
}
