import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['**/*.{test,spec}.ts'],
        exclude: ['node_modules', 'out', 'release'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['shared/**/*.ts', 'electron/services/**/*.ts', 'src/lib/**/*.ts']
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@shared': resolve(__dirname, 'shared')
        }
    }
})
