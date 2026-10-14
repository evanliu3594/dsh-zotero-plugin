/**
 * Output-contract acceptance gate (live Zotero required).
 *
 * Drives every tool through the REAL ToolRuntime so the harness's own output
 * validation runs — the lossless-JSON check that a direct `execute()` call skips,
 * and the check that caught the rejected `zotero_list_collections` result.
 * Read-only: GETs only, zotero_add_item is never invoked.
 *
 *   node --experimental-strip-types tests/output-contract.ts
 */
import * as cordis from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'
import type { Config } from '../src/config.ts'

const ctx = new cordis.Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRuntime)
await new Promise((resolve) => setTimeout(resolve, 600))
const config = (plugin.Config as unknown as (input: unknown) => Config)({})
plugin.apply(ctx, config)
await new Promise((resolve) => setTimeout(resolve, 400))

interface ToolResult {
  isError?: boolean
  value?: any
  content?: Array<{ text?: string }>
  error?: { info?: unknown; message?: string }
}
const runtime = ctx.get('tools') as { execute: (input: unknown) => Promise<ToolResult> } | undefined
if (typeof runtime?.execute !== 'function') throw new Error('ToolRuntime service is not available')

let callId = 0
const run = (name: string, args: unknown) =>
  runtime!.execute({ callId: `gate-${++callId}`, name, arguments: args, signal: new AbortController().signal })

let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}
const detailOf = (result: ToolResult) =>
  result.isError
    ? `isError info=${JSON.stringify(result.error?.info)} msg=${JSON.stringify(result.error?.message?.slice(0, 160))}`
    : `valueBytes=${JSON.stringify(result.value)?.length}`

// Fixture keys from the live library.
const recent = await run('zotero_recent_items', { limit: 4 })
const keys: string[] = (recent.value?.items ?? []).map((item: any) => item.key)
console.log(`fixture keys: ${keys.join(', ')}\n`)

const cases: Array<[string, unknown]> = [
  ['zotero_status', {}],
  ['zotero_search_items', { limit: 3 }],
  // The two paths the verifier found rejected: note rows carry no data.title,
  // and a top-level collection carries no parentCollection.
  ['zotero_search_items', { itemType: 'note', scope: 'all', limit: 5 }],
  ['zotero_search_items', { itemType: 'attachment', scope: 'all', limit: 5 }],
  ['zotero_search_items', { scope: 'all', limit: 5 }],
  ['zotero_list_collections', { limit: 3 }],
  ['zotero_list_collections', {}],
  ['zotero_list_tags', { limit: 3 }],
  ['zotero_list_tags', {}],
  ['zotero_get_children', { itemKey: keys[0] }],
  ['zotero_get_item', { itemKey: keys[0], includeChildren: true }],
  ['zotero_get_selected_collection', {}],
  ['zotero_recent_items', { limit: 2 }],
]

for (const [name, args] of cases) {
  const result = await run(name, args)
  check(`${name} ${JSON.stringify(args)}`, !result.isError, detailOf(result))
}

// Export paths, including the failure-reporting contract.
const exports: Array<[string, unknown, (value: any) => boolean]> = [
  ['csljson single', { itemKeys: [keys[0]], format: 'csljson' }, (v) => v.count === 1],
  ['csljson multi', { itemKeys: keys.slice(0, 2), format: 'csljson' }, (v) => v.count === 2],
  ['bibtex multi', { itemKeys: keys.slice(0, 2), format: 'bibtex' }, (v) => v.count === 2],
  ['csljson missing key', { itemKeys: [keys[0], 'ZZZZZZZZ'], format: 'csljson' }, (v) => v.count === 1 && v.failedKeys?.includes('ZZZZZZZZ')],
  ['bibtex missing key', { itemKeys: [keys[0], 'ZZZZZZZZ'], format: 'bibtex' }, (v) => v.count === 1 && v.failedKeys?.includes('ZZZZZZZZ')],
  ['bibtex all missing', { itemKeys: ['ZZZZZZZZ', 'YYYYYYYY'], format: 'bibtex' }, (v) => v.count === 0 && v.export === ''],
  ['csljson dedupe', { itemKeys: [keys[0], keys[0]], format: 'csljson' }, (v) => v.requested === 1 && v.count === 1],
]
for (const [label, args, ok] of exports) {
  const result = await run('zotero_get_bibtex', args)
  check(`get_bibtex ${label}`, !result.isError && ok(result.value), result.isError ? detailOf(result) : JSON.stringify(result.value).slice(0, 200))
}

// The empty key must be rejected instead of exporting the whole library.
const emptyKey = await run('zotero_get_bibtex', { itemKeys: [''], format: 'bibtex' })
check('get_bibtex empty key rejected', emptyKey.isError === true, detailOf(emptyKey))

const malformed = await run('zotero_get_bibtex', { itemKeys: ['..'], format: 'csljson' })
check('get_bibtex malformed key rejected', malformed.isError === true, detailOf(malformed))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
