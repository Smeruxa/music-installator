import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL } from 'node:url'
import type { IncomingMessage } from 'node:http'

export interface NodeHttpRequestOptions {
    method?: string
    headers?: Record<string, string>
    body?: string | Buffer
    timeoutMs?: number
}

export function nodeHttpRequest(url: string, options: NodeHttpRequestOptions = {}): Promise<{
    statusCode: number
    body: Buffer
}> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const isHttps = parsed.protocol === 'https:'
        const transport = isHttps ? httpsRequest : httpRequest
        const method = options.method ?? 'GET'
        const headers = { ...(options.headers ?? {}) }
        if (options.body !== undefined && headers['Content-Length'] === undefined) {
            headers['Content-Length'] = String(Buffer.byteLength(options.body))
        }

        const req = transport(
            {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                method,
                headers
            },
            (res: IncomingMessage) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk)
                })
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode ?? 0,
                        body: Buffer.concat(chunks)
                    })
                })
            }
        )

        req.setTimeout(options.timeoutMs ?? 20_000, () => {
            req.destroy(new Error('HTTP request timeout'))
        })
        req.on('error', reject)

        if (options.body !== undefined) {
            req.write(options.body)
        }
        req.end()
    })
}

export async function nodeHttpText(
    url: string,
    options: NodeHttpRequestOptions = {}
): Promise<string> {
    const response = await nodeHttpRequest(url, options)
    return response.body.toString('utf8')
}
