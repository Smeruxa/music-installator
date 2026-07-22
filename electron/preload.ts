import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
    AudioFetchProgress,
    AuthResult,
    DownloadProgress,
    DownloadStartPayload,
    LibraryPayload,
    LoginPayload,
    SessionInfo,
    TokenLoginPayload
} from '../shared/types'

const api = {
    auth: {
        getSession: (): Promise<SessionInfo> => ipcRenderer.invoke('auth:getSession'),
        login: (payload: LoginPayload): Promise<AuthResult> =>
            ipcRenderer.invoke('auth:login', payload),
        loginWithToken: (payload: TokenLoginPayload): Promise<AuthResult> =>
            ipcRenderer.invoke('auth:loginWithToken', payload),
        logout: (): Promise<{ ok: true }> => ipcRenderer.invoke('auth:logout')
    },
    audio: {
        fetchAll: (): Promise<
            { ok: true; library: LibraryPayload } | { ok: false; error: string }
        > => ipcRenderer.invoke('audio:fetchAll'),
        onProgress: (cb: (progress: AudioFetchProgress) => void): (() => void) => {
            const listener = (_event: IpcRendererEvent, progress: AudioFetchProgress): void => {
                cb(progress)
            }
            ipcRenderer.on('audio:progress', listener)
            return () => {
                ipcRenderer.removeListener('audio:progress', listener)
            }
        }
    },
    dialog: {
        chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseDirectory')
    },
    settings: {
        getDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:getDirectory'),
        setDirectory: (dir: string): Promise<boolean> =>
            ipcRenderer.invoke('settings:setDirectory', dir)
    },
    download: {
        start: (
            payload: DownloadStartPayload
        ): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> =>
            ipcRenderer.invoke('download:start', payload),
        cancel: (): Promise<{ ok: true }> => ipcRenderer.invoke('download:cancel'),
        onProgress: (cb: (progress: DownloadProgress) => void): (() => void) => {
            const listener = (_event: IpcRendererEvent, progress: DownloadProgress): void => {
                cb(progress)
            }
            ipcRenderer.on('download:progress', listener)
            return () => {
                ipcRenderer.removeListener('download:progress', listener)
            }
        },
        onDone: (
            cb: (result: {
                completed: number
                total: number
                failed?: number
                cancelled?: boolean
            }) => void
        ): (() => void) => {
            const listener = (
                _event: IpcRendererEvent,
                result: {
                    completed: number
                    total: number
                    failed?: number
                    cancelled?: boolean
                }
            ): void => {
                cb(result)
            }
            ipcRenderer.on('download:done', listener)
            return () => {
                ipcRenderer.removeListener('download:done', listener)
            }
        }
    }
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
