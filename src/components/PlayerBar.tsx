import type { ChangeEvent, JSX } from 'react'
import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { MdVolumeDown, MdVolumeMute, MdVolumeUp } from 'react-icons/md'
import Hls from 'hls.js'
import { isHlsUrl } from '../../shared/files'
import { playerStore } from '../stores/player'
import styles from './PlayerBar.module.scss'

function PlayIcon({ playing }: { playing: boolean }): JSX.Element {
    if (playing) {
        return (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
        )
    }
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M4 2.5v11l9-5.5-9-5.5z" fill="currentColor" />
        </svg>
    )
}

function VolumeIcon({ volume }: { volume: number }): JSX.Element {
    if (volume <= 0.001) {
        return <MdVolumeMute size={18} aria-hidden />
    }
    if (volume < 0.45) {
        return <MdVolumeDown size={18} aria-hidden />
    }
    return <MdVolumeUp size={18} aria-hidden />
}

export const PlayerBar = observer(function PlayerBar(): JSX.Element | null {
    const { current, playing, volume, setPlaying, setVolume } = playerStore
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const hlsRef = useRef<Hls | null>(null)
    const lastAudibleVolume = useRef(volume > 0 ? volume : 0.85)

    useEffect(() => {
        if (volume > 0.001) {
            lastAudibleVolume.current = volume
        }
    }, [volume])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !current) {
            return
        }

        hlsRef.current?.destroy()
        hlsRef.current = null

        const url = current.url
        if (!url) {
            setPlaying(false)
            return
        }

        audio.volume = playerStore.volume

        if (isHlsUrl(url) && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true })
            hlsRef.current = hls
            hls.loadSource(url)
            hls.attachMedia(audio)
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (playerStore.playing) {
                    void audio.play().catch(() => setPlaying(false))
                }
            })
        } else if (isHlsUrl(url) && audio.canPlayType('application/vnd.apple.mpegurl')) {
            audio.src = url
            if (playerStore.playing) {
                void audio.play().catch(() => setPlaying(false))
            }
        } else {
            audio.src = url
            if (playerStore.playing) {
                void audio.play().catch(() => setPlaying(false))
            }
        }

        return () => {
            hlsRef.current?.destroy()
            hlsRef.current = null
        }
    }, [current, setPlaying])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !current) {
            return
        }
        if (playing) {
            void audio.play().catch(() => setPlaying(false))
        } else {
            audio.pause()
        }
    }, [playing, current, setPlaying])

    useEffect(() => {
        const audio = audioRef.current
        if (audio) {
            audio.volume = volume
        }
    }, [volume])

    if (!current) {
        return null
    }

    function onVolumeChange(event: ChangeEvent<HTMLInputElement>): void {
        setVolume(Number(event.target.value) / 100)
    }

    function onMuteToggle(): void {
        if (volume > 0.001) {
            setVolume(0)
            return
        }
        setVolume(lastAudibleVolume.current)
    }

    return (
        <div className={styles.bar}>
            <button
                type="button"
                className={styles.button}
                aria-label={playing ? 'Пауза' : 'Играть'}
                onClick={() => setPlaying(!playing)}
            >
                <PlayIcon playing={playing} />
            </button>
            <div className={styles.texts}>
                <div className={styles.title}>{current.title}</div>
                <div className={styles.artist}>{current.artist}</div>
            </div>
            <div className={styles.volume}>
                <button
                    type="button"
                    className={styles.volumeButton}
                    aria-label={volume > 0.001 ? 'Выключить звук' : 'Включить звук'}
                    onClick={onMuteToggle}
                >
                    <VolumeIcon volume={volume} />
                </button>
                <input
                    className={styles.slider}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(volume * 100)}
                    onChange={onVolumeChange}
                    aria-label="Громкость"
                />
            </div>
            <audio
                className={styles.audio}
                ref={audioRef}
                onEnded={() => setPlaying(false)}
                onError={() => setPlaying(false)}
            />
        </div>
    )
})
