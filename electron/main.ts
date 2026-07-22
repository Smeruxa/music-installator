import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { loginWithKate, loginWithToken } from './services/vk-auth'
import { refreshWebSession } from './services/vk-web-auth'
import type { VkSession } from '../shared/types'
import { fetchLibrary } from './services/vk-audio'
import { DownloadService } from './services/downloader'
import {
    clearAllAppData,
    clearSession,
    getDownloadDirectory,
    loadSession,
    saveSession,
    setDownloadDirectory
} from './services/session'
import { getLogFilePath, logError, logInfo, logWarn } from './services/logger'
import type {
    AuthResult,
    DownloadStartPayload,
    LoginPayload,
    SessionInfo,
    TokenLoginPayload,
    Track,
    LibraryPayload
} from '../shared/types'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let session: VkSession | null = null
let tracksCache: Track[] = []
const downloadService = new DownloadService(() => mainWindow)

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 860,
        minHeight: 600,
        show: false,
        title: 'VK Music Installer',
        backgroundColor: '#e8eef4',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        void shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

function registerIpc(): void {
    ipcMain.handle('auth:getSession', (): SessionInfo => {
        if (!session) {
            session = loadSession()
        }
        if (!session) {
            return { loggedIn: false, userId: 0 }
        }
        return { loggedIn: true, userId: session.userId }
    })

    ipcMain.handle('auth:login', async (_event, payload: LoginPayload): Promise<AuthResult> => {
        logInfo('main', 'auth:login')
        try {
            const result = await loginWithKate(payload, mainWindow)
            if ('session' in result) {
                session = result.session
                saveSession(session)
                logInfo('main', 'auth:login success', {
                    userId: session.userId,
                    audioRefreshed: session.audioRefreshed === true
                })
                return { ok: true, userId: session.userId }
            }
            logInfo('main', 'auth:login incomplete', result)
            return result
        } catch (err: unknown) {
            logError('main', 'auth:login exception', err)
            return {
                ok: false,
                error: err instanceof Error ? err.message : String(err)
            }
        }
    })

    ipcMain.handle(
        'auth:loginWithToken',
        async (_event, payload: TokenLoginPayload): Promise<AuthResult> => {
            logInfo('main', 'auth:loginWithToken')
            try {
                const result = await loginWithToken(payload)
                if ('session' in result) {
                    session = result.session
                    saveSession(session)
                    return { ok: true, userId: session.userId }
                }
                return result
            } catch (err: unknown) {
                logError('main', 'auth:loginWithToken exception', err)
                return {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                }
            }
        }
    )

    ipcMain.handle('auth:logout', (): { ok: true } => {
        session = null
        tracksCache = []
        clearSession()
        logInfo('main', 'auth:logout')
        return { ok: true }
    })

    ipcMain.handle(
        'audio:fetchAll',
        async (
            event
        ): Promise<{ ok: true; library: LibraryPayload } | { ok: false; error: string }> => {
            if (!session) {
                return { ok: false, error: 'Не авторизован' }
            }
            if (session.client === 'web') {
                try {
                    const refreshed = await refreshWebSession(session)
                    if (refreshed !== undefined) {
                        session = refreshed
                        saveSession(session)
                    }
                } catch (err: unknown) {
                    logWarn('main', 'web session refresh before audio failed', err)
                }
            }
            logInfo('main', 'audio:fetchAll start', {
                userId: session.userId,
                client: session.client,
                audioRefreshed: session.audioRefreshed === true
            })
            try {
                const library = await fetchLibrary(session, (loaded: number, total: number) => {
                    event.sender.send('audio:progress', { loaded, total })
                })
                tracksCache = [...library.recent, ...library.myMusic]
                logInfo('main', 'audio:fetchAll ok', {
                    recent: library.recent.length,
                    myMusic: library.myMusic.length
                })
                return { ok: true, library }
            } catch (err: unknown) {
                logError('main', 'audio:fetchAll failed', err)
                return {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                }
            }
        }
    )

    ipcMain.handle('dialog:chooseDirectory', async (): Promise<string | null> => {
        const win = mainWindow
        if (!win) {
            return null
        }
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || !result.filePaths[0]) {
            return null
        }
        setDownloadDirectory(result.filePaths[0])
        return result.filePaths[0]
    })

    ipcMain.handle('settings:getDirectory', (): string | null => {
        return getDownloadDirectory() ?? null
    })

    ipcMain.handle('settings:setDirectory', (_event, dir: string): boolean => {
        setDownloadDirectory(dir)
        return true
    })

    ipcMain.handle(
        'download:start',
        async (
            _event,
            payload: DownloadStartPayload
        ): Promise<{ ok: true } | { ok: false; error: string }> => {
            if (!session) {
                return { ok: false, error: 'Не авторизован' }
            }
            if (!payload.directory) {
                return { ok: false, error: 'Не выбрана директория' }
            }
            if (!payload.trackKeys?.length) {
                return { ok: false, error: 'Ничего не выбрано' }
            }
            return downloadService.start(session, tracksCache, payload.trackKeys, payload.directory)
        }
    )
}

app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.musicinstallator.app')
    }

    const existing = loadSession()
    if (existing !== null && existing.client !== 'web') {
        clearAllAppData()
        session = null
        logInfo('main', 'dropped legacy Kate/OAuth session; need web cookie login')
    } else {
        session = existing
    }
    tracksCache = []
    logInfo('main', 'app ready', {
        logFile: getLogFilePath(),
        loggedIn: session !== null,
        audioRefreshed: session?.audioRefreshed === true
    })

    registerIpc()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
