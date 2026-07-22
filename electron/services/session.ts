import { safeStorage, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VkSession } from '../../shared/types'
import { isVkSession } from '../../shared/guards'
import { parsePersistedShape } from './session-parse'
import type { PersistedShape } from './session-types'

function storePath(): string {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return join(dir, 'vk-music-installer.json')
}

function readStore(): PersistedShape {
    try {
        const path = storePath()
        if (!existsSync(path)) {
            return {}
        }
        return parsePersistedShape(readFileSync(path, 'utf8'))
    } catch {
        return {}
    }
}

function writeStore(data: PersistedShape): void {
    writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8')
}

export function saveSession(session: VkSession): void {
    const data = readStore()
    if (!safeStorage.isEncryptionAvailable()) {
        data.encryptedSession = Buffer.from(JSON.stringify(session), 'utf8').toString('base64')
    } else {
        data.encryptedSession = safeStorage
            .encryptString(JSON.stringify(session))
            .toString('base64')
    }
    writeStore(data)
}

export function loadSession(): VkSession | null {
    const raw = readStore().encryptedSession
    if (!raw) {
        return null
    }
    try {
        const buf = Buffer.from(raw, 'base64')
        const json = safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(buf)
            : buf.toString('utf8')
        const parsed: unknown = JSON.parse(json)
        if (!isVkSession(parsed)) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

export function clearSession(): void {
    const data = readStore()
    delete data.encryptedSession
    writeStore(data)
}

export function clearAllAppData(): void {
    writeStore({})
}

export function getDownloadDirectory(): string | undefined {
    return readStore().downloadDirectory
}

export function setDownloadDirectory(dir: string): void {
    const data = readStore()
    data.downloadDirectory = dir
    writeStore(data)
}
