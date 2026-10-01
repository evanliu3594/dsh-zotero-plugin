/**
 * Minimal HTTP client for the Zotero desktop local server (127.0.0.1:23119).
 *
 * Two endpoint families live on the same port:
 * - `/api/users/{id}/...`  Zotero 7+ local API, a read-only mirror of the web API.
 * - `/connector/...`       the connector server the browser extension uses; `saveItems`
 *                          is the only sanctioned localhost write path.
 *
 * Kept dependency-free (plain fetch) so it can be exercised standalone.
 */

export class ZoteroError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message)
    this.name = 'ZoteroError'
  }
}

export interface ZoteroClientOptions {
  /** Zotero desktop HTTP host. */
  host: string
  /** Zotero local server port (23119 by default). */
  port: number
  /** Local API library id; `0` addresses the current local user library. */
  libraryId: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
}

export type QueryParams = Record<string, string | number | boolean | undefined>

export interface ApiPage<T> {
  data: T
  /** From the `Total-Results` response header; absent when Zotero does not send it. */
  total: number | undefined
}

export interface ConnectorResponse {
  status: number
  data: unknown
  text: string
}

/** Escape a URL path segment (collection/item keys are [A-Z0-9]{8} but stay defensive). */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

export class ZoteroLocalClient {
  readonly base: string
  private readonly headers: Record<string, string>

  constructor(readonly options: ZoteroClientOptions) {
    this.base = `http://${options.host}:${options.port}`
    this.headers = {
      'Zotero-Allowed-Request': 'true',
      'Zotero-API-Version': '3',
    }
  }

  private buildApiUrl(path: string, params?: QueryParams): URL {
    const clean = path.replace(/^\/+/, '').replace(/\/+$/, '')
    const segments = clean.split('/').map(encodePathSegment).join('/')
    const url = new URL(`${this.base}/api/users/${this.options.libraryId}/${segments}`)
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
    return url
  }

  private async raw(url: URL, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const composed = signal ? AbortSignal.any([signal, timeout]) : timeout
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: composed })
    } catch (error) {
      if (signal?.aborted) throw error
      const cause = (error as { cause?: { code?: string } })?.cause?.code
      throw new ZoteroError(
        `无法连接 Zotero (${url.origin})：请确认 Zotero 桌面端已启动，且 设置 → 高级 → ` +
          `“允许其他应用程序与 Zotero 通信” 已勾选${cause ? `（${cause}）` : ''}`,
        undefined,
        url.toString(),
      )
    }
    return response
  }

  private async readBody(response: Response): Promise<string> {
    const text = await response.text()
    if (!response.ok) {
      if (response.status === 501) {
        throw new ZoteroError(
          'Zotero 本地 API 为只读（501）：localhost 上的 /api 端点不支持修改操作。' +
            '本插件唯一支持的写入路径是 zotero_add_item（connector saveItems）。',
          response.status,
          response.url,
        )
      }
      throw new ZoteroError(
        `Zotero API ${response.status}: ${text.slice(0, 300) || '(empty body)'}`,
        response.status,
        response.url,
      )
    }
    return text
  }

  /** GET one `/api/users/{libraryId}/…` JSON page. */
  async api<T = unknown>(path: string, params?: QueryParams, signal?: AbortSignal): Promise<ApiPage<T>> {
    const url = this.buildApiUrl(path, { format: 'json', ...params })
    const response = await this.raw(url, { method: 'GET', headers: this.headers }, signal)
    const text = await this.readBody(response)
    let data: T
    try {
      data = JSON.parse(text) as T
    } catch {
      throw new ZoteroError(`Zotero API 返回了非 JSON 内容: ${text.slice(0, 200)}`, response.status, response.url)
    }
    const totalHeader = response.headers.get('Total-Results')
    return { data, total: totalHeader === null ? undefined : Number(totalHeader) }
  }

  /** GET one `/api/users/{libraryId}/…` page as raw text (bibtex / csljson export formats). */
  async apiText(path: string, params?: QueryParams, signal?: AbortSignal): Promise<ApiPage<string>> {
    const url = this.buildApiUrl(path, params)
    const response = await this.raw(url, { method: 'GET', headers: this.headers }, signal)
    const text = await this.readBody(response)
    const totalHeader = response.headers.get('Total-Results')
    return { data: text, total: totalHeader === null ? undefined : Number(totalHeader) }
  }

  /**
   * Fetch every page of a list endpoint (100 per page, Zotero's page cap) up to `cap` rows.
   * Local API honors `Total-Results`, so termination is header-driven with a data-driven fallback.
   */
  async apiAll(path: string, params: QueryParams, cap: number, signal?: AbortSignal): Promise<ApiPage<unknown[]>> {
    const rows: unknown[] = []
    let start = 0
    let total: number | undefined
    while (rows.length < cap) {
      const page = await this.api<unknown[]>(path, { ...params, limit: 100, start }, signal)
      const batch = Array.isArray(page.data) ? page.data : []
      rows.push(...batch)
      total = page.total ?? (batch.length < 100 ? start + batch.length : undefined)
      start += batch.length
      if (batch.length === 0 || (total !== undefined && start >= total)) break
    }
    return { data: rows.slice(0, cap), total }
  }

  /** POST one `/connector/…` endpoint. `data` is parsed JSON when the body is JSON. */
  async connector(path: string, body?: unknown, signal?: AbortSignal): Promise<ConnectorResponse> {
    const url = new URL(`${this.base}/connector/${path.replace(/^\/+/, '')}`)
    const response = await this.raw(
      url,
      {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      },
      signal,
    )
    const text = await this.readBody(response)
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      // keep raw text
    }
    return { status: response.status, data, text }
  }

  /** Lightweight liveness probe of the connector server; never throws for "not running". */
  async ping(signal?: AbortSignal): Promise<{ running: boolean; version: string | undefined }> {
    const url = new URL(`${this.base}/connector/ping`)
    try {
      const response = await this.raw(url, { method: 'GET', headers: this.headers }, signal)
      const body = await response.text()
      const running = response.ok && /zotero is running/i.test(body)
      return { running, version: response.headers.get('X-Zotero-Version') ?? undefined }
    } catch (error) {
      if (signal?.aborted) throw error
      return { running: false, version: undefined }
    }
  }
}
