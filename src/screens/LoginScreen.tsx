import type { FormEvent, JSX } from 'react'
import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { isAuthError, isAuthNeed2fa, isAuthNeedCaptcha } from '../../shared/guards'
import { authStore } from '../stores/auth'
import styles from './LoginScreen.module.scss'

type AuthTab = 'password' | 'token'

export const LoginScreen = observer(function LoginScreen(): JSX.Element {
    const { login, loginWithToken, loading, lastResult } = authStore

    const [tab, setTab] = useState<AuthTab>('password')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [code, setCode] = useState('')
    const [captchaKey, setCaptchaKey] = useState('')
    const [token, setToken] = useState('')
    const [userId, setUserId] = useState('')

    const need2fa = lastResult !== null && isAuthNeed2fa(lastResult)
    const needCaptcha = lastResult !== null && isAuthNeedCaptcha(lastResult)
    const error = lastResult !== null && isAuthError(lastResult) ? lastResult.error : null

    async function onPasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault()
        await login({
            login: username.trim(),
            password,
            code: need2fa ? code.trim() || undefined : undefined,
            captchaSid: needCaptcha ? lastResult.captchaSid : undefined,
            captchaKey: needCaptcha ? captchaKey.trim() || undefined : undefined
        })
    }

    async function onTokenSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault()
        const parsedUserId = userId.trim().length > 0 ? Number(userId.trim()) : undefined
        await loginWithToken({
            token: token.trim(),
            userId:
                parsedUserId !== undefined && Number.isFinite(parsedUserId)
                    ? parsedUserId
                    : undefined
        })
    }

    return (
        <div className={styles.screen}>
            <div className={styles.panel}>
                <h1 className={styles.brand}>VK Music Installer</h1>
                <p className={styles.sub}>
                    Войдите в аккаунт ВК, чтобы скачать свою музыку локально.
                </p>

                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={`${styles.tab} ${tab === 'token' ? styles.tabActive : ''}`}
                        onClick={() => setTab('token')}
                        disabled={loading}
                    >
                        Токен
                    </button>
                    <button
                        type="button"
                        className={`${styles.tab} ${tab === 'password' ? styles.tabActive : ''}`}
                        onClick={() => setTab('password')}
                        disabled={loading}
                    >
                        Логин / пароль
                    </button>
                </div>

                {error !== null && <p className={styles.error}>{error}</p>}

                {tab === 'token' ? (
                    <form onSubmit={onTokenSubmit}>
                        <p className={styles.hint}>
                            Вставьте access_token от Kate Mobile (или уже refreshed audio-token).
                            User ID можно не указывать — определится автоматически.
                        </p>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="token">
                                Access token
                            </label>
                            <textarea
                                className={styles.textarea}
                                id="token"
                                value={token}
                                onChange={(event) => setToken(event.target.value)}
                                required
                                disabled={loading}
                                placeholder="vk1.a...."
                            />
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="userId">
                                User ID (опционально)
                            </label>
                            <input
                                className={styles.input}
                                id="userId"
                                value={userId}
                                onChange={(event) => setUserId(event.target.value)}
                                disabled={loading}
                                inputMode="numeric"
                            />
                        </div>
                        <button className={styles.button} type="submit" disabled={loading}>
                            {loading ? 'Проверка…' : 'Войти по токену'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={onPasswordSubmit}>
                        <p className={styles.hint}>
                            Откроется окно VK. Войдите вручную до ленты новостей — логин/пароль
                            попробуем подставить сами. После входа окно закроется само (нужны cookies
                            сессии).
                        </p>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="login">
                                Телефон или email
                            </label>
                            <input
                                className={styles.input}
                                id="login"
                                autoComplete="username"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="password">
                                Пароль
                            </label>
                            <input
                                className={styles.input}
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        {need2fa && (
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="code">
                                    Код 2FA
                                    {lastResult.phoneMask ? ` (${lastResult.phoneMask})` : ''}
                                </label>
                                <input
                                    className={styles.input}
                                    id="code"
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    required
                                    disabled={loading}
                                    placeholder="Код из SMS или приложения"
                                />
                            </div>
                        )}

                        {needCaptcha && (
                            <>
                                <img
                                    className={styles.captcha}
                                    src={lastResult.captchaImg}
                                    alt="Капча"
                                />
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="captcha">
                                        Капча
                                    </label>
                                    <input
                                        className={styles.input}
                                        id="captcha"
                                        value={captchaKey}
                                        onChange={(event) => setCaptchaKey(event.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>
                            </>
                        )}

                        <button className={styles.button} type="submit" disabled={loading}>
                            {loading ? 'Вход…' : 'Войти'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
})
