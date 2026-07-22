import type { JSX, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { Track } from '../../shared/types'
import { formatDuration } from '../../shared/files'
import styles from './TrackRow.module.scss'

interface TrackRowProps {
    track: Track
    checked: boolean
    playing: boolean
    onPlay: (track: Track) => void
    onSelectPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => void
}

export function TrackRow({
    track,
    checked,
    playing,
    onPlay,
    onSelectPointerDown
}: TrackRowProps): JSX.Element {
    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPlay(track)
        }
    }

    const rowClass = playing ? `${styles.row} ${styles.playing}` : styles.row

    return (
        <div
            className={rowClass}
            onClick={() => onPlay(track)}
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <input
                className={styles.checkbox}
                type="checkbox"
                checked={checked}
                readOnly
                onClick={(event) => event.stopPropagation()}
                onPointerDown={onSelectPointerDown}
                aria-label={`Выбрать ${track.title}`}
            />
            <div className={styles.texts}>
                <div className={styles.title}>{track.title}</div>
                <div className={styles.artist}>{track.artist}</div>
            </div>
            <div className={styles.duration}>{formatDuration(track.duration)}</div>
        </div>
    )
}
