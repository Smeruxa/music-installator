import { createWriteStream, existsSync, unlinkSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(
    await import('node:fs/promises').then((fs) =>
        fs.readFile(join(root, 'node_modules/ffmpeg-static/package.json'), 'utf8')
    )
)
const release = pkg['ffmpeg-static']['binary-release-tag']
const dir = join(root, 'node_modules/ffmpeg-static')
const target = join(dir, 'ffmpeg.exe')
const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}/ffmpeg-win32-x64.gz`

for (const name of ['ffmpeg', 'ffmpeg.exe']) {
    const path = join(dir, name)
    if (existsSync(path)) {
        unlinkSync(path)
    }
}

const response = await fetch(url)
if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать ffmpeg для Windows: HTTP ${response.status}`)
}

await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(target))
chmodSync(target, 0o755)
console.log(`ffmpeg Windows x64 готов: ${target}`)
