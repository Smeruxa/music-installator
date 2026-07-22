import type { CSSProperties, JSX } from 'react'
import styles from './SkeletonList.module.scss'

interface SkeletonListProps {
    count?: number
    loaded?: number
    total?: number | null
}

function progressStyle(ratio: number): CSSProperties {
    return {
        width: `${Math.round(ratio * 100)}%`
    }
}

export function SkeletonList({
    count = 12,
    loaded = 0,
    total = null
}: SkeletonListProps): JSX.Element {
    const rows = Array.from({ length: count }, (_: unknown, index: number) => index)
    const hasTotal = total != null && total > 0
    const ratio = hasTotal ? Math.min(1, loaded / total) : null
    const percentLabel = ratio != null ? `${Math.round(ratio * 100)}%` : null

    return (
        <div className={styles.wrap} aria-busy="true" aria-label="Загрузка треков">
            <div className={styles.progressCard}>
                <div className={styles.progressCopy}>
                    <div className={styles.progressTitle}>Собираем вашу музыку</div>
                    <div className={styles.progressMeta}>
                        {percentLabel ?? 'Подключаемся к VK…'}
                    </div>
                </div>
                <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio != null ? Math.round(ratio * 100) : undefined}>
                    <div
                        className={ratio != null ? styles.fill : `${styles.fill} ${styles.indeterminate}`}
                        style={ratio != null ? progressStyle(ratio) : undefined}
                    />
                </div>
            </div>
            <div className={styles.list}>
                {rows.map((index: number) => (
                    <div className={styles.row} key={index}>
                        <div className={`${styles.line} ${styles.box}`} />
                        <div>
                            <div className={`${styles.line} ${styles.title}`} />
                            <div className={`${styles.line} ${styles.artist}`} />
                        </div>
                        <div className={`${styles.line} ${styles.duration}`} />
                    </div>
                ))}
            </div>
        </div>
    )
}
