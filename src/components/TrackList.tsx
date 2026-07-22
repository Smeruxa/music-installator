import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Track } from '../../shared/types'
import { trackKey } from '../../shared/selection'
import { firstVisibleIndexFromScroll } from '../../shared/viewport'
import { TrackRow } from './TrackRow'
import styles from './TrackList.module.scss'

const ROW_HEIGHT = 64
const LIST_PADDING_TOP = 8

interface TrackListProps {
    tracks: Track[]
    selected: Set<string>
    currentKey: string | null
    section?: 'recent' | 'myMusic'
    trackFirstVisible?: boolean
    compact?: boolean
    onPlay: (track: Track) => void
    onFirstVisibleChange?: (index: number) => void
    onApplyDragRange: (
        base: ReadonlySet<string>,
        fromIndex: number,
        toIndex: number,
        checked: boolean,
        section: 'recent' | 'myMusic'
    ) => void
}

interface DragState {
    pointerId: number
    mode: boolean
    startIndex: number
    lastIndex: number
    base: Set<string>
}

function virtualItemStyle(offset: number, height: number): CSSProperties {
    return {
        top: `${offset}px`,
        height: `${height}px`
    }
}

function spacerStyle(totalSize: number): CSSProperties {
    return {
        height: `${totalSize}px`
    }
}

export function TrackList({
    tracks,
    selected,
    currentKey,
    section = 'myMusic',
    trackFirstVisible = false,
    compact = false,
    onPlay,
    onFirstVisibleChange,
    onApplyDragRange
}: TrackListProps): JSX.Element {
    const parentRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<DragState | null>(null)
    const selectedRef = useRef(selected)
    const applyRangeRef = useRef(onApplyDragRange)
    selectedRef.current = selected
    applyRangeRef.current = onApplyDragRange

    const virtualizer = useVirtualizer({
        count: tracks.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 12
    })

    const items = virtualizer.getVirtualItems()

    useEffect(() => {
        if (!trackFirstVisible || !onFirstVisibleChange) {
            return
        }
        const parent = parentRef.current
        if (!parent) {
            return
        }

        const updateFirstVisible = (): void => {
            onFirstVisibleChange(
                firstVisibleIndexFromScroll(
                    parent.scrollTop,
                    LIST_PADDING_TOP,
                    ROW_HEIGHT,
                    tracks.length
                )
            )
        }

        updateFirstVisible()
        parent.addEventListener('scroll', updateFirstVisible, { passive: true })
        return () => {
            parent.removeEventListener('scroll', updateFirstVisible)
        }
    }, [tracks.length, onFirstVisibleChange, trackFirstVisible])

    function indexFromClientY(clientY: number): number {
        const parent = parentRef.current
        if (!parent || tracks.length === 0) {
            return 0
        }
        const rect = parent.getBoundingClientRect()
        const y = clientY - rect.top + parent.scrollTop - LIST_PADDING_TOP
        const index = Math.floor(y / ROW_HEIGHT)
        return Math.max(0, Math.min(tracks.length - 1, index))
    }

    function handleSelectPointerDown(
        event: ReactPointerEvent<HTMLInputElement>,
        index: number,
        key: string
    ): void {
        if (event.button !== 0) {
            return
        }
        event.preventDefault()
        event.stopPropagation()

        const mode = !selectedRef.current.has(key)
        const base = new Set(selectedRef.current)
        dragRef.current = {
            pointerId: event.pointerId,
            mode,
            startIndex: index,
            lastIndex: index,
            base
        }
        parentRef.current?.classList.add(styles.dragging)
        applyRangeRef.current(base, index, index, mode, section)

        const onMove = (moveEvent: PointerEvent): void => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== moveEvent.pointerId) {
                return
            }
            const nextIndex = indexFromClientY(moveEvent.clientY)
            if (nextIndex === drag.lastIndex) {
                return
            }
            drag.lastIndex = nextIndex
            applyRangeRef.current(drag.base, drag.startIndex, nextIndex, drag.mode, section)
        }

        const onUp = (upEvent: PointerEvent): void => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== upEvent.pointerId) {
                return
            }
            dragRef.current = null
            parentRef.current?.classList.remove(styles.dragging)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
    }

    return (
        <div className={compact ? `${styles.list} ${styles.listCompact}` : styles.list} ref={parentRef}>
            <div className={styles.spacer} style={spacerStyle(virtualizer.getTotalSize())}>
                {items.map((item) => {
                    const track = tracks[item.index]
                    const key = trackKey(track)
                    return (
                        <div
                            key={key}
                            className={styles.item}
                            style={virtualItemStyle(item.start, item.size)}
                        >
                            <TrackRow
                                track={track}
                                checked={selected.has(key)}
                                playing={currentKey === key}
                                onPlay={onPlay}
                                onSelectPointerDown={(event) =>
                                    handleSelectPointerDown(event, item.index, key)
                                }
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
