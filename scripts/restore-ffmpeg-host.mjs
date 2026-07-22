import { existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'node_modules/ffmpeg-static')

for (const name of ['ffmpeg', 'ffmpeg.exe']) {
    const path = join(dir, name)
    if (existsSync(path)) {
        unlinkSync(path)
    }
}

const result = spawnSync(process.execPath, [join(dir, 'install.js')], {
    cwd: root,
    env: {
        ...process.env,
        npm_config_platform: os.platform(),
        npm_config_arch: os.arch()
    },
    stdio: 'inherit'
})

if (result.status !== 0) {
    process.exit(result.status ?? 1)
}
