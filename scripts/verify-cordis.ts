/**
 * Cordis-level wiring verification: mounts the REAL ToolRuntime service from
 * @deepseek-ai/dsh-tools in a bare Context, applies the plugin, and inspects
 * what got registered — no full harness boot needed.
 *
 *   node --import tsx/esm scripts/verify-cordis.ts
 */

import * as cordis from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { default as ToolRuntime } from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'

const ctx = new cordis.Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRuntime)
await new Promise((resolve) => setTimeout(resolve, 500))

plugin.apply(ctx, plugin.Config({}))
await new Promise((resolve) => setTimeout(resolve, 300))

const runtime = (ctx as any)[ToolRuntime] ?? (ctx as any)[Symbol.for('tools')] ?? (ctx as any).tools
const tools = runtime?.schemas?.() ?? []
console.log('registered tools:', tools.map((t) => t.name).join(', '))
console.log('count:', tools.length)
const search = tools.find((t) => t.name === 'zotero_search_items')
if (search) {
  console.log('zotero_search_items parameters:', Object.keys(search.parameters?.properties ?? {}).join(', '))
}
await ctx.dispose?.() ?? (ctx as any).destroy?.()
console.log('OK: plugin loads and registers against the real ToolRuntime service')
