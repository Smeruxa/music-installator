import { makeAutoObservable, runInAction } from 'mobx'
import type { DownloadStatus } from '../../shared/types'

class DownloadStore {
    active = false
    completed = 0
    total = 0
    lastError: string | null = null
    byTrack: Record<string, DownloadStatus> = {}

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true })
    }

    async start(trackKeys: string[], directory: string): Promise<void> {
        const initial: Record<string, DownloadStatus> = {}
        for (const key of trackKeys) {
            initial[key] = 'queued'
        }
        this.active = true
        this.completed = 0
        this.total = trackKeys.length
        this.lastError = null
        this.byTrack = initial

        const unsubProgress = window.api.download.onProgress((progress) => {
            runInAction(() => {
                this.completed = progress.completed
                this.total = progress.total
                this.byTrack = { ...this.byTrack, [progress.trackKey]: progress.status }
                if (progress.status === 'error' && progress.error) {
                    this.lastError = progress.error
                }
            })
        })

        const unsubDone = window.api.download.onDone((result) => {
            runInAction(() => {
                this.active = false
                if (result.cancelled) {
                    this.lastError = null
                }
            })
        })

        try {
            const result = await window.api.download.start({ trackKeys, directory })
            if (!result.ok) {
                runInAction(() => {
                    this.active = false
                    this.lastError = result.cancelled ? null : result.error
                })
            }
        } finally {
            unsubProgress()
            unsubDone()
            runInAction(() => {
                this.active = false
            })
        }
    }

    async cancel(): Promise<void> {
        if (!this.active) {
            return
        }
        await window.api.download.cancel()
    }

    reset(): void {
        this.active = false
        this.completed = 0
        this.total = 0
        this.lastError = null
        this.byTrack = {}
    }
}

export const downloadStore = new DownloadStore()
