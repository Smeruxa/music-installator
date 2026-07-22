import { makeAutoObservable, runInAction } from 'mobx'
import type { Track } from '../../shared/types'
import {
    allTrackKeys,
    applyRangeChecked,
    mergeSelectedKeys,
    selectNearestKeys,
    toggleKey
} from '../../shared/selection'

export type LibrarySection = 'myMusic' | 'recent'

class LibraryStore {
    recent: Track[] = []
    myMusic: Track[] = []
    selected = new Set<string>()
    activeSection: LibrarySection = 'myMusic'
    loading = false
    loaded = 0
    total: number | null = null
    error: string | null = null
    firstVisibleIndex = 0
    directory: string | null = null

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true })
    }

    get activeTracks(): Track[] {
        return this.activeSection === 'recent' ? this.recent : this.myMusic
    }

    get trackCount(): number {
        return this.recent.length + this.myMusic.length
    }

    setActiveSection(section: LibrarySection): void {
        this.activeSection = section
        this.firstVisibleIndex = 0
    }

    setFirstVisibleIndex(index: number): void {
        this.firstVisibleIndex = Math.max(0, index)
    }

    setDirectory(dir: string | null): void {
        this.directory = dir
    }

    toggle(key: string): void {
        this.selected = toggleKey(this.selected, key)
    }

    selectAll(): void {
        this.selected = mergeSelectedKeys(this.selected, allTrackKeys(this.activeTracks))
    }

    selectNearest15(): void {
        const nearest = selectNearestKeys(this.activeTracks, this.firstVisibleIndex, 15)
        this.selected = mergeSelectedKeys(this.selected, nearest)
    }

    clearSelection(): void {
        this.selected = new Set()
    }

    applyDragRange(
        base: ReadonlySet<string>,
        fromIndex: number,
        toIndex: number,
        checked: boolean,
        section: LibrarySection = this.activeSection
    ): void {
        const tracks = section === 'recent' ? this.recent : this.myMusic
        this.selected = applyRangeChecked(base, tracks, fromIndex, toIndex, checked)
    }

    async fetchAll(): Promise<void> {
        this.loading = true
        this.error = null
        this.loaded = 0
        this.total = null
        this.recent = []
        this.myMusic = []
        this.selected = new Set()

        const unsub = window.api.audio.onProgress((progress) => {
            runInAction(() => {
                this.loaded = progress.loaded
                this.total = progress.total
            })
        })

        try {
            const result = await window.api.audio.fetchAll()
            runInAction(() => {
                if (!result.ok) {
                    this.loading = false
                    this.error = result.error
                    return
                }
                this.recent = result.library.recent
                this.myMusic = result.library.myMusic
                this.loading = false
                this.loaded = result.library.myMusic.length
                this.total = result.library.myMusic.length
                if (this.myMusic.length === 0 && this.recent.length > 0) {
                    this.activeSection = 'recent'
                }
            })
        } catch (err: unknown) {
            runInAction(() => {
                this.loading = false
                this.error = err instanceof Error ? err.message : String(err)
            })
        } finally {
            unsub()
        }
    }

    reset(): void {
        this.recent = []
        this.myMusic = []
        this.selected = new Set()
        this.activeSection = 'myMusic'
        this.loading = false
        this.loaded = 0
        this.total = null
        this.error = null
        this.firstVisibleIndex = 0
    }
}

export const libraryStore = new LibraryStore()
