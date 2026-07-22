export function formatDuration(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
    const minutes = Math.floor(safe / 60)
    const rest = safe % 60
    return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function sanitizeFileName(name: string): string {
    const withoutControls = Array.from(name)
        .map((char: string) => {
            const code = char.charCodeAt(0)
            if (code < 32 || '<>:"/\\|?*'.includes(char)) {
                return '_'
            }
            return char
        })
        .join('')
    return withoutControls.replace(/\s+/g, ' ').trim().slice(0, 180)
}

export function buildTrackFileBase(artist: string, title: string, fallback: string): string {
    const base = sanitizeFileName(`${artist} - ${title}`)
    return base.length > 0 ? base : sanitizeFileName(fallback)
}

export function nextAvailableFileName(
    existingNames: ReadonlySet<string>,
    baseName: string,
    extension: string
): string {
    const primary = `${baseName}.${extension}`
    if (!existingNames.has(primary)) {
        return primary
    }
    let index = 2
    while (existingNames.has(`${baseName} (${index}).${extension}`)) {
        index += 1
    }
    return `${baseName} (${index}).${extension}`
}

export function isHlsUrl(url: string): boolean {
    return url.includes('.m3u8')
}
