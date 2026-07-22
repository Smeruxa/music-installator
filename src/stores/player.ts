import { makeAutoObservable } from 'mobx'
import type { Track } from '../../shared/types'
import { trackKey } from '../../shared/selection'

const VOLUME_KEY = 'music-installator.volume'

function readStoredVolume(): number {
    try {
        const raw = localStorage.getItem(VOLUME_KEY)
        if (raw === null) {
            return 0.85
        }
        const value = Number(raw)
        if (!Number.isFinite(value)) {
            return 0.85
        }
        return Math.min(1, Math.max(0, value))
    } catch {
        return 0.85
    }
}

class PlayerStore {
    current: Track | null = null
    playing = false
    volume = readStoredVolume()

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true })
    }

    play(track: Track): void {
        this.current = track
        this.playing = true
    }

    toggle(track: Track): void {
        if (this.current && trackKey(this.current) === trackKey(track)) {
            this.playing = !this.playing
            return
        }
        this.current = track
        this.playing = true
    }

    setPlaying(playing: boolean): void {
        this.playing = playing
    }

    setVolume(volume: number): void {
        const next = Math.min(1, Math.max(0, volume))
        try {
            localStorage.setItem(VOLUME_KEY, String(next))
        } catch (_error: unknown) {
            void _error
        }
        this.volume = next
    }

    stop(): void {
        this.current = null
        this.playing = false
    }
}

export const playerStore = new PlayerStore()
