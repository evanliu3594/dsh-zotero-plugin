/**
 * Read-back regression on the title Zotero rewrites (live Zotero required).
 *
 * The title below is the measured case: sent as "… (ignored by Zotero)", stored as
 * "… (ignored by zotero)". Before the fix the case-sensitive comparison matched
 * nothing and createdKeys came back empty; it must now resolve to the newest item.
 * Runs against the BUILT artifact, the file the packaged runtime imports.
 *
 *   node --experimental-strip-types tests/readback-regression.ts
 *
 * This CREATES one item in the library.
 */
import type * as PluginSurface from '../src/index.ts'
import type { Config as ConfigShape } from '../src/config.ts'

// The built bundle ships no declarations, so it is typed by the source module it
// was built from. Resolving it by URL keeps TypeScript from demanding a
// declaration file for the specifier.
const plugin = (await import(new URL('../lib/index.js', import.meta.url).href)) as unknown as typeof PluginSurface

const config = (plugin.Config as unknown as (input: unknown) => ConfigShape)({})
const exec = { signal: new AbortController().signal }
const registered: any[] = []
;(plugin.apply as (ctx: unknown, config: unknown) => void)(
  { tools: { register: (def: any) => { registered.push(def); return () => {} } }, logger: { info() {} } },
  config,
)
const tool = (name: string) => registered.find((t: any) => t.name === name)!

const TITLE = '[插件冒烟测试 · 可安全删除] language 报告验证 language "de" (ignored by Zotero)'

const created: any = await tool('zotero_add_item').execute({
  itemType: 'journalArticle',
  title: TITLE,
  creators: [{ creatorType: 'author', lastName: 'Rewrite' }],
  date: '2026-10-14',
  tags: ['dsh-zotero-smoke-test', '可安全删除'],
}, exec)

console.log(`createdKeys=${JSON.stringify(created.createdKeys)} readBackFailed=${JSON.stringify(created.readBackFailed)} hint=${JSON.stringify(created.hint ?? null)}`)

const key = created.createdKeys?.[0]
if (key) {
  const item: any = await tool('zotero_get_item').execute({ itemKey: key }, exec)
  const stored: string = item?.data?.title ?? ''
  console.log(`\nkey ${key} resolves to:`)
  console.log(`  stored : ${JSON.stringify(stored)}`)
  console.log(`  sent   : ${JSON.stringify(TITLE)}`)
  console.log(`  Zotero rewrote it : ${stored !== TITLE}`)
  console.log(`  dateAdded         : ${item?.data?.dateAdded}`)
  console.log(`  case-insensitive equal: ${stored.toLowerCase() === TITLE.toLowerCase()}`)
} else {
  console.log('NO KEY RETURNED — the defect is back')
}
