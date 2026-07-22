import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function logDir(): string {
    const dir = join(app.getPath('userData'), 'logs')
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

function logPath(): string {
    return join(logDir(), 'app.log')
}

function formatArg(value: unknown): string {
    if (value instanceof Error) {
        return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
    }
    if (typeof value === 'string') {
        return value
    }
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

export function logInfo(scope: string, message: string, extra?: unknown): void {
    write('INFO', scope, message, extra)
}

export function logWarn(scope: string, message: string, extra?: unknown): void {
    write('WARN', scope, message, extra)
}

export function logError(scope: string, message: string, extra?: unknown): void {
    write('ERROR', scope, message, extra)
}

function write(level: string, scope: string, message: string, extra?: unknown): void {
    const stamp = new Date().toISOString()
    const line =
        extra === undefined
            ? `[${stamp}] ${level} [${scope}] ${message}`
            : `[${stamp}] ${level} [${scope}] ${message} ${formatArg(extra)}`
    try {
        appendFileSync(logPath(), `${line}\n`, 'utf8')
    } catch (_error: unknown) {
        void _error
    }
    if (level === 'ERROR') {
        console.error(line)
    } else if (level === 'WARN') {
        console.warn(line)
    } else {
        console.log(line)
    }
}

export function getLogFilePath(): string {
    return logPath()
}
