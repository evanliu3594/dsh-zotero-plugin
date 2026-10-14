/**
 * Source plane vs artifact plane: does a fix reach the SHIPPED bundle?
 *
 * package.json declares main/exports -> ./lib/index.js, and the packaged desktop
 * runtime loads that bundle (the official runtime does no TypeScript transform).
 * This script drives one fake Zotero server through the real ToolRuntime twice —
 * once with the plugin from src/, once from lib/ — and reports every probe on
 * both planes, so a fix that only exists in src/ fails here.
 *
 * Read-only: the fake server is in-process; no request reaches Zotero.
 *
 *   node --experimental-strip-types tests/source-artifact-ab.ts
 */
import type * as PluginSurface from '../src/index.ts'
import * as pluginSrc from '../src/index.ts'
import { boot, makeState, startFakeZotero } from './fake-zotero.ts'
import type { Booted, FakeState, PluginModule, ToolResult } from './fake-zotero.ts'

// The built bundle ships no declarations, so it is typed by the source module it
// was built from. Resolving it by URL keeps TypeScript from demanding a
// declaration file for the specifier.
const lib = (await import(new URL('../lib/index.js', import.meta.url).href)) as unknown as typeof PluginSurface

let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}
const outcome = (result: ToolResult) => result.isError
  ? `REJECTED ${JSON.stringify(result.error?.message?.slice(0, 110))}`
  : `accepted ${JSON.stringify(result.value).slice(0, 150)}`

const state: FakeState = makeState({ version: null, libraryName: null, rows: [], totalHeader: null, collections: [], tags: [] })
const server = await startFakeZotero(state)
const src: Booted = await boot(pluginSrc, server.port)
const shipped: Booted = await boot(lib, server.port)
console.log(`fake Zotero on 127.0.0.1:${server.port}\n`)

interface Probe {
  fix: string
  name: string
  args: unknown
  patch: Partial<FakeState>
}

let requests = 0
let saveItemsHits = 0

const probes: Probe[] = [
  {
    fix: 'A  zotero_status: empty library + ping without X-Zotero-Version',
    name: 'zotero_status', args: {},
    patch: { version: null, libraryName: null, rows: [], totalHeader: null },
  },
  {
    fix: 'A2 zotero_status: API up, connector sends a version header',
    name: 'zotero_status', args: {},
    patch: { version: '10.0.6', libraryName: 'Fake Library', rows: [{ key: 'AAAAAAAA', data: { itemType: 'journalArticle' }, meta: {} }], totalHeader: null },
  },
  {
    fix: 'B  zotero_get_item: envelope without meta',
    name: 'zotero_get_item', args: { itemKey: 'F1' },
    patch: { itemDetail: { key: 'F1', data: { itemType: 'note' } } },
  },
  {
    fix: 'C1 zotero_search_items: Total-Results header absent',
    name: 'zotero_search_items', args: { limit: 3 },
    patch: { rows: [{ key: 'AAAAAAAA', data: { title: 'T' } }], totalHeader: null },
  },
  {
    fix: 'C2 zotero_recent_items: Total-Results header absent',
    name: 'zotero_recent_items', args: { limit: 3 },
    patch: { rows: [{ key: 'AAAAAAAA', data: { title: 'T' } }], totalHeader: null },
  },
  {
    fix: 'C3 zotero_list_collections: Total-Results = abc (NaN)',
    name: 'zotero_list_collections', args: {},
    patch: { totalHeader: 'abc', collections: [{ key: 'C1', data: { name: 'One' }, meta: { numItems: 1 } }] },
  },
  {
    fix: 'C4 zotero_list_tags: Total-Results = abc (NaN)',
    name: 'zotero_list_tags', args: {},
    patch: { totalHeader: 'abc', tags: ['alpha', 'beta'] },
  },
  {
    fix: 'D  zotero_get_selected_collection: target without recent',
    name: 'zotero_get_selected_collection', args: {},
    patch: { selected: { libraryID: 1, targets: [{ id: 'C1', name: 'One', level: 0 }] } },
  },
]

for (const probe of probes) {
  Object.assign(state, makeState({ version: null, libraryName: null, rows: [], totalHeader: null, collections: [], tags: [] }), probe.patch)
  const srcResult = await src.run(probe.name, probe.args)
  const libResult = await shipped.run(probe.name, probe.args)
  requests += state.log.length
  saveItemsHits += state.saveItemsHits
  console.log(`# ${probe.fix}`)
  console.log(`    src/ : ${outcome(srcResult)}`)
  console.log(`    lib/ : ${outcome(libResult)}`)
  check(`src/${probe.name} accepts`, !srcResult.isError, outcome(srcResult))
  check(`shipped lib/${probe.name} accepts`, !libResult.isError, outcome(libResult))
}

console.log(`\nfake-server requests: ${requests}; connector saveItems hits: ${saveItemsHits}`)
check('no write request was issued', saveItemsHits === 0)
await server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
