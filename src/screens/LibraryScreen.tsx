import type { JSX } from 'react'
import { useCallback, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { MdOutlineDeselect, MdOutlineSelectAll } from 'react-icons/md'
import { trackKey } from '../../shared/selection'
import { SkeletonList } from '../components/SkeletonList'
import { TrackList } from '../components/TrackList'
import { PlayerBar } from '../components/PlayerBar'
import { Button } from '../components/Button'
import { authStore } from '../stores/auth'
import { libraryStore } from '../stores/library'
import { playerStore } from '../stores/player'
import { downloadStore } from '../stores/download'
import styles from './LibraryScreen.module.scss'

export const LibraryScreen = observer(function LibraryScreen(): JSX.Element {
    const {
        recent,
        myMusic,
        selected,
        activeSection,
        activeTracks,
        loading,
        loaded,
        total,
        error,
        directory,
        selectAll,
        clearSelection,
        applyDragRange,
        selectNearest15,
        setActiveSection,
        fetchAll,
        setDirectory,
        setFirstVisibleIndex,
        reset
    } = libraryStore

    const { current, toggle: togglePlay, stop } = playerStore
    const {
        active: downloadActive,
        completed: downloadCompleted,
        total: downloadTotal,
        lastError: downloadError,
        start: startDownload
    } = downloadStore

    useEffect(() => {
        void (async () => {
            const dir = await window.api.settings.getDirectory()
            setDirectory(dir)
            await fetchAll()
        })()
    }, [fetchAll, setDirectory])

    async function onChooseDir(): Promise<void> {
        const dir = await window.api.dialog.chooseDirectory()
        if (dir) {
            setDirectory(dir)
        }
    }

    async function onLogout(): Promise<void> {
        stop()
        reset()
        await authStore.logout()
    }

    async function onInstall(): Promise<void> {
        if (!directory || selected.size === 0 || downloadActive) {
            return
        }
        await startDownload([...selected], directory)
    }

    const onFirstVisibleChange = useCallback(
        (index: number) => {
            setFirstVisibleIndex(index)
        },
        [setFirstVisibleIndex]
    )

    const currentKey = current ? trackKey(current) : null
    const selectionDisabled = loading || activeTracks.length === 0

    return (
        <div className={styles.screen}>
            <header className={styles.header}>
                <div className={styles.top}>
                    <h1 className={styles.title}>VK Music Installer</h1>
                    <Button variant="ghost" onClick={() => void onLogout()}>
                        Выйти
                    </Button>
                </div>

                <nav className={styles.nav} aria-label="Разделы библиотеки">
                    <button
                        type="button"
                        className={`${styles.navItem} ${activeSection === 'myMusic' ? styles.navItemActive : ''}`}
                        onClick={() => setActiveSection('myMusic')}
                        disabled={loading}
                    >
                        Моя музыка
                        <span className={styles.navCount}>{myMusic.length}</span>
                    </button>
                    <button
                        type="button"
                        className={`${styles.navItem} ${activeSection === 'recent' ? styles.navItemActive : ''}`}
                        onClick={() => setActiveSection('recent')}
                        disabled={loading}
                    >
                        Недавно прослушанные
                        <span className={styles.navCount}>{recent.length}</span>
                    </button>
                </nav>

                <div className={styles.toolbar}>
                    <Button variant="ghost" onClick={() => void onChooseDir()}>
                        Выбрать директорию
                    </Button>
                    <div className={styles.path} title={directory ?? undefined}>
                        {directory ?? 'Директория не выбрана'}
                    </div>
                    <div className={styles.selectionActions}>
                        <Button
                            variant="icon"
                            onClick={selectAll}
                            disabled={selectionDisabled}
                            aria-label="Выбрать все"
                            title="Выбрать все в разделе"
                        >
                            <MdOutlineSelectAll />
                        </Button>
                        <Button
                            variant="icon"
                            onClick={clearSelection}
                            disabled={selectionDisabled || selected.size === 0}
                            aria-label="Убрать все"
                            title="Убрать все"
                        >
                            <MdOutlineDeselect />
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={selectNearest15}
                        disabled={selectionDisabled}
                    >
                        Выбрать 15 ближайших
                    </Button>
                    <Button
                        variant="primary"
                        disabled={!directory || selected.size === 0 || downloadActive || loading}
                        onClick={() => void onInstall()}
                    >
                        Установить ({selected.size})
                    </Button>
                </div>

                <div className={styles.meta}>
                    {loading
                        ? 'Загружаем библиотеку…'
                        : error
                          ? null
                          : `${activeTracks.length} в разделе · выбрано ${selected.size}`}
                </div>
            </header>

            {(downloadActive || downloadError) && (
                <div className={styles.banner}>
                    {downloadActive
                        ? `Установка ${downloadCompleted} / ${downloadTotal}`
                        : downloadError
                          ? `Ошибка: ${downloadError}`
                          : null}
                </div>
            )}

            <div className={styles.listWrap}>
                {loading && <SkeletonList loaded={loaded} total={total} />}
                {!loading && error && (
                    <div className={styles.state}>
                        <p>{error}</p>
                        <Button variant="primary" onClick={() => void fetchAll()}>
                            Повторить
                        </Button>
                    </div>
                )}
                {!loading && !error && activeTracks.length === 0 && (
                    <div className={styles.state}>
                        {activeSection === 'recent'
                            ? 'Пока нет недавно прослушанных'
                            : 'В «Моей музыке» пока нет треков'}
                    </div>
                )}
                {!loading && !error && activeTracks.length > 0 && (
                    <TrackList
                        tracks={activeTracks}
                        selected={selected}
                        currentKey={currentKey}
                        section={activeSection}
                        trackFirstVisible
                        onPlay={togglePlay}
                        onFirstVisibleChange={onFirstVisibleChange}
                        onApplyDragRange={applyDragRange}
                    />
                )}
                <PlayerBar />
            </div>
        </div>
    )
})
