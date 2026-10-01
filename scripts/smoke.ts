/**
 * Standalone smoke run against a LIVE Zotero on localhost:23119.
 *
 *   node --import tsx/esm scripts/smoke.ts            # read-only tools
 *   node --import tsx/esm scripts/smoke.ts --write    # also save one clearly-named test item
 *
 * It drives the same execute() bodies the harness dispatches, with a minimal
 * fake exec context (only `signal` is used by these tools).
 */

import * as plugin from '../src/index.ts'
import type { Config } from '../src/config.ts'

const config = (plugin.Config as unknown as (input: unknown) => Config)({})

// Drive apply() with a capturing fake registry — same path the harness takes.
const registered: any[] = []
const ctx = {
  tools: {
    register(definition: any) {
      registered.push(definition)
      return () => {}
    },
  },
  logger: { info: (...args: unknown[]) => console.log('[plugin-log]', ...args) },
} as any

plugin.apply(ctx, config)

const exec = { signal: new AbortController().signal } as any

async function run(name: string, args: Record<string, unknown> = {}): Promise<void> {
  const tool = registered.find((candidate) => candidate.name === name)
  if (!tool) {
    console.log(`✗ ${name}: NOT REGISTERED`)
    return
  }
  try {
    const value = await tool.execute(args, exec)
    const text = JSON.stringify(value, null, 2)
    console.log(`✓ ${name} → ${text.length} bytes`)
    console.log(text.length > 1400 ? `${text.slice(0, 1400)}\n…(truncated)` : text)
  } catch (error) {
    console.log(`✗ ${name} THREW: ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log('─'.repeat(72))
}

const write = process.argv.includes('--write')

await run('zotero_status')
await run('zotero_list_collections', { limit: 10 })
await run('zotero_list_tags', { prefix: 'model', limit: 5 })
await run('zotero_recent_items', { limit: 3 })
await run('zotero_search_items', { query: 'carbon', limit: 3 })
await run('zotero_search_items', { tag: 'model', limit: 2 })

// pick a real key from recent items for detail/children/bibtex
const recentTool = registered.find((candidate) => candidate.name === 'zotero_recent_items')
let sampleKey: string | undefined
try {
  const recent = await recentTool.execute({ limit: 1 }, exec) as { items?: Array<{ key?: string }> }
  sampleKey = recent.items?.[0]?.key
} catch {}
console.log(`sample key = ${sampleKey ?? '(none)'}`)
console.log('─'.repeat(72))

if (sampleKey) {
  await run('zotero_get_item', { itemKey: sampleKey, includeChildren: true })
  await run('zotero_get_children', { itemKey: sampleKey })
  await run('zotero_get_bibtex', { itemKeys: [sampleKey], format: 'bibtex' })
}
await run('zotero_get_selected_collection')

if (write) {
  await run('zotero_add_item', {
    itemType: 'journalArticle',
    title: '[dsh-zotero 插件冒烟测试条目 — 可安全删除]',
    creators: [{ lastName: 'Smoke', firstName: 'Test', creatorType: 'author' }],
    publicationTitle: 'DSH Plugin Smoke Test',
    date: '2026',
    DOI: '10.0000/dsh-smoke-test',
    tags: ['dsh-zotero-smoke-test'],
    note: 'This item was created by the dsh-zotero smoke test. Safe to delete.',
  })
}
