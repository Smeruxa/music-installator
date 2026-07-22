import type { PersistedShape } from './session-types'
import { isRecord, parseJsonUnknown, readString } from '../../shared/guards'

export function parsePersistedShape(text: string): PersistedShape {
    const value = parseJsonUnknown(text)
    if (!isRecord(value)) {
        return {}
    }
    const result: PersistedShape = {}
    const encryptedSession = readString(value.encryptedSession)
    if (encryptedSession !== undefined) {
        result.encryptedSession = encryptedSession
    }
    const downloadDirectory = readString(value.downloadDirectory)
    if (downloadDirectory !== undefined) {
        result.downloadDirectory = downloadDirectory
    }
    return result
}
