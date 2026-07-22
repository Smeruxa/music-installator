import { makeAutoObservable, runInAction } from 'mobx'
import type { AuthResult, LoginPayload, TokenLoginPayload } from '../../shared/types'
import { isAuthSuccess } from '../../shared/guards'

class AuthStore {
    ready = false
    loggedIn = false
    userId = 0
    loading = false
    lastResult: AuthResult | null = null

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true })
    }

    async hydrate(): Promise<void> {
        const session = await window.api.auth.getSession()
        runInAction(() => {
            this.ready = true
            this.loggedIn = session.loggedIn
            this.userId = session.userId
        })
    }

    async login(payload: LoginPayload): Promise<AuthResult> {
        this.loading = true
        this.lastResult = null
        const result = await window.api.auth.login(payload)
        return this.applyAuthResult(result)
    }

    async loginWithToken(payload: TokenLoginPayload): Promise<AuthResult> {
        this.loading = true
        this.lastResult = null
        const result = await window.api.auth.loginWithToken(payload)
        return this.applyAuthResult(result)
    }

    async logout(): Promise<void> {
        await window.api.auth.logout()
        runInAction(() => {
            this.loggedIn = false
            this.userId = 0
            this.lastResult = null
        })
    }

    private applyAuthResult(result: AuthResult): AuthResult {
        runInAction(() => {
            if (isAuthSuccess(result)) {
                this.loggedIn = true
                this.userId = result.userId
                this.loading = false
                this.lastResult = result
            } else {
                this.loading = false
                this.lastResult = result
            }
        })
        return result
    }
}

export const authStore = new AuthStore()
