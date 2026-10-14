/**
 * Regression check for the empty-library path of zotero_status (live Zotero required).
 *
 * A real client that answers `items/top` with the empty page the live server
 * returns for an unmatched query — the effect of an empty library — while every
 * other endpoint stays real. Verified through the REAL ToolRuntime so the
 * harness's lossless-JSON output check runs: before the fix, `libraryName` was an
 * undefined property and this diagnostic tool rejected its own result.
 *
 * Read-only: GETs only.
 *
 *   node --experimental-strip-types tests/empty-library-status.ts
 */
import * as cordis from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Config } from '../src/config.ts'
import type { Config as ConfigShape } from '../src/config.ts'
import { buildTools } from '../src/tools.ts'
import { ZoteroLocalClient } from '../src/client.ts'
import type { QueryParams } from '../src/client.ts'

const real = new ZoteroLocalClient({ host: '127.0.0.1', port: 23119, libraryId: '0', timeoutMs: 15000 })
// Confirm the empty page the live server returns for an unmatched query.
const emptyPage = await real.api('items/top', { limit: 1, q: 'zzzz-no-such-title-zzzz' })
console.log('real empty page rows:', Array.isArray(emptyPage.data) ? emptyPage.data.length : 'n/a')

// A client whose items/top is empty, standing in for an empty library.
const emptyLibrary = Object.create(real) as ZoteroLocalClient
let intercepted = 0
Object.defineProperty(emptyLibrary, 'api', {
  value: async (path: string, params?: QueryParams, signal?: AbortSignal) => {
    if (path === 'items/top' && params?.limit === 1) {
      intercepted++
      return { data: [], total: 0 }
    }
    return real.api(path, params, signal)
  },
})

const makeContext = async () => {
  const ctx = new cordis.Context()
  ctx.plugin(SystemPrompt)
  ctx.plugin(ToolRuntime)
  await new Promise((resolve) => setTimeout(resolve, 500))
  return ctx
}

let callId = 0
const runWith = async (client: ZoteroLocalClient, args: Record<string, unknown> = {}) => {
  const ctx = await makeContext()
  buildTools(client, (Config as unknown as (input: unknown) => ConfigShape)({})).forEach((tool) => ctx.tools.register({ ...tool, name: `probe_${tool.name}` }))
  await new Promise((resolve) => setTimeout(resolve, 200))
  const runtime = ctx.get('tools') as any
  return runtime.execute({ callId: `p-${++callId}`, name: 'probe_zotero_status', arguments: args, signal: new AbortController().signal })
}

const withEmpty = await runWith(emptyLibrary)
console.log('\nempty-library zotero_status:', withEmpty.isError ? `REJECTED ${JSON.stringify(withEmpty.error?.info)} ${withEmpty.error?.message}` : 'ACCEPTED')
console.log('value:', JSON.stringify(withEmpty.value))

const withReal = await runWith(real)
console.log('\nreal-library zotero_status:', withReal.isError ? `REJECTED ${JSON.stringify(withReal.error?.info)}` : 'ACCEPTED')
console.log('value:', JSON.stringify(withReal.value))
console.log(`\nintercepted items/top calls: ${intercepted}`)

const ok = !withEmpty.isError && !withReal.isError && intercepted > 0
console.log(ok ? '\nPASS: zotero_status survives an empty library' : '\nFAIL')
process.exit(ok ? 0 : 1)
