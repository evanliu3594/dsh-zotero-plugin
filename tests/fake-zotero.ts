/**
 * Shared infrastructure for the fake-server gates.
 *
 * An in-process HTTP server that speaks just enough of the Zotero localhost
 * protocol (connector ping + read-only /api mirror) for the REAL
 * ZoteroLocalClient to talk to, plus a real ToolRuntime boot so every probe
 * crosses the harness lossless-JSON + output-schema gate.
 *
 * Read-only by construction: the fake server records every request; a
 * `/connector/saveItems` request is counted but never forwarded anywhere.
 */
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import * as cordis from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Config } from '../src/config.ts'
import type { Config as ConfigShape } from '../src/config.ts'

export interface FakeState {
  /** Value of X-Zotero-Version on /connector/ping; null omits the header. */
  version: string | null
  /** Status for /connector/ping. */
  pingStatus: number
  /** Body for /connector/ping. */
  pingBody: string
  /** Rows served by items/top, items, items/trash, collections/{k}/items[top]. */
  rows: any[]
  /** library.name injected into the first items/top row; null injects nothing. */
  libraryName: string | null
  /** Status for every /api request when not 200. */
  apiStatus: number
  /** Value of the Total-Results header; null omits the header. */
  totalHeader: string | null
  collections: any[]
  tags: any[]
  /** Body of items/{key}; undefined -> 404. */
  itemDetail: any
  /** Body of items/{key}/children. */
  children: any[]
  /** Body of items/{key}?format=csljson. */
  cslEntries: any[]
  /** Text body of items?format=bibtex. */
  bibtex: string
  /** Body of connector getSelectedCollection; a string is sent as non-JSON text. */
  selected: unknown
  log: string[]
  saveItemsHits: number
}

export function makeState(over: Partial<FakeState> = {}): FakeState {
  return {
    version: '10.0.6',
    pingStatus: 200,
    pingBody: 'Zotero is running',
    rows: [],
    libraryName: 'Fake Library',
    apiStatus: 200,
    totalHeader: null,
    collections: [],
    tags: [],
    itemDetail: undefined,
    children: [],
    cslEntries: [],
    bibtex: '',
    selected: {},
    log: [],
    saveItemsHits: 0,
    ...over,
  }
}

export interface FakeServer {
  port: number
  state: FakeState
  close(): Promise<void>
}

function page<T>(rows: T[], url: URL): T[] {
  const limit = Number(url.searchParams.get('limit') ?? '25')
  const start = Number(url.searchParams.get('start') ?? '0')
  return rows.slice(start, start + (Number.isFinite(limit) ? limit : 25))
}

export async function startFakeZotero(state: FakeState): Promise<FakeServer> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    state.log.push(`${req.method} ${path}${url.search}`)
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
      res.end(body)
    }

    if (path === '/connector/ping') {
      const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
      if (state.version !== null) headers['X-Zotero-Version'] = state.version
      res.writeHead(state.pingStatus, headers)
      res.end(state.pingBody)
      return
    }
    if (path === '/connector/getSelectedCollection') {
      if (typeof state.selected === 'string') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(state.selected)
        return
      }
      send(200, JSON.stringify(state.selected))
      return
    }
    if (path === '/connector/saveItems') {
      state.saveItemsHits++
      send(200, JSON.stringify({}))
      return
    }

    if (state.apiStatus !== 200) {
      send(state.apiStatus, 'boom')
      return
    }
    const totalHeaders: Record<string, string> = {}
    if (state.totalHeader !== null) totalHeaders['Total-Results'] = state.totalHeader
    const total = state.totalHeader === null ? undefined : totalHeaders
    const rest = path.replace('/api/users/0/', '')
    const format = url.searchParams.get('format')

    if (format === 'bibtex') {
      res.writeHead(200, { 'Content-Type': 'text/plain', ...total })
      res.end(state.bibtex)
      return
    }
    if (rest === 'items/top' || rest === 'items' || rest === 'items/trash') {
      const rows = page(state.rows, url)
      if (state.libraryName !== null && rows[0] !== undefined) {
        rows[0] = { ...rows[0], library: { name: state.libraryName } }
      }
      send(200, JSON.stringify(rows), total)
      return
    }
    if (rest.startsWith('items/') && rest.endsWith('/children')) {
      send(200, JSON.stringify(page(state.children, url)), total)
      return
    }
    if (rest.startsWith('collections/') && rest.endsWith('/items/top')) {
      send(200, JSON.stringify(page(state.rows, url)), total)
      return
    }
    if (rest === 'collections') {
      send(200, JSON.stringify(page(state.collections, url)), total)
      return
    }
    if (rest === 'tags') {
      send(200, JSON.stringify(page(state.tags, url)), total)
      return
    }
    if (rest.startsWith('items/')) {
      if (format === 'csljson') {
        send(200, JSON.stringify(state.cslEntries), total)
        return
      }
      if (format === 'bibtex') {
        res.writeHead(200, { 'Content-Type': 'text/plain', ...total })
        res.end(state.bibtex)
        return
      }
      if (state.itemDetail === undefined) {
        send(404, 'Not found')
        return
      }
      send(200, JSON.stringify(state.itemDetail), total)
      return
    }
    send(404, 'Not found')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    port,
    state,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()) }),
  }
}

/**
 * The plugin's public surface, declared here rather than imported from lib/.
 *
 * The built bundle emits no declarations, and TypeScript does not read the config
 * scripts that enable allowJs. Both planes (src/ and lib/) satisfy this interface,
 * which is all the gates need.
 */
export interface PluginModule {
  name?: string
  inject?: readonly string[]
  Config: (input: unknown) => unknown
  apply?: (ctx: unknown, config: unknown) => void
}

export interface ToolResult {
  isError?: boolean
  value?: any
  content?: Array<{ text?: string }>
  error?: { info?: unknown; message?: string }
}

export interface Booted {
  run(name: string, args: unknown, signal?: AbortSignal): Promise<ToolResult>
  names: string[]
  ctx: InstanceType<typeof cordis.Context>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Boot one plugin module against a fake Zotero port with a real ToolRuntime. */
export async function boot(plugin: any, port: number): Promise<Booted> {
  const ctx = new cordis.Context()
  ctx.plugin(SystemPrompt)
  ctx.plugin(ToolRuntime)
  await sleep(600)
  const config = (plugin.Config as unknown as (input: unknown) => ConfigShape)({ host: '127.0.0.1', port })
  plugin.apply(ctx, config)
  await sleep(300)
  const runtime = ctx.get('tools') as { execute: (input: unknown) => Promise<ToolResult> } | undefined
  if (typeof runtime?.execute !== 'function') throw new Error('ToolRuntime service is not available')
  const names: string[] = []
  let callId = 0
  return {
    ctx,
    names,
    run: (name: string, args: unknown, signal?: AbortSignal) =>
      runtime.execute({
        callId: `v3-${++callId}`,
        name,
        arguments: args,
        signal: signal ?? new AbortController().signal,
      }),
  }
}

/** Register one extra tool on a booted context (used for gate control cases). */
export function register(booted: Booted, tool: unknown): void {
  ;(booted.ctx.tools as { register: (value: unknown) => unknown }).register(tool)
}

/** Every path in a JSON graph whose value the harness gate would reject. */
export function findLossyPaths(value: unknown, path = 'value'): string[] {
  const bad: string[] = []
  const seen = new Set<object>()
  const walk = (node: unknown, at: string): void => {
    if (node === undefined) { bad.push(`${at} = undefined`); return }
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) bad.push(`${at} = ${String(node)}`)
      else if (Object.is(node, -0)) bad.push(`${at} = -0`)
      return
    }
    if (node === null || typeof node !== 'object') return
    if (seen.has(node as object)) { bad.push(`${at} = <cycle>`); return }
    seen.add(node as object)
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${at}[${index}]`))
      return
    }
    for (const [key, entry] of Object.entries(node as Record<string, unknown>)) walk(entry, `${at}.${key}`)
  }
  walk(value, path)
  return bad
}

export const KEY8 = 'AAAAAAAA'
