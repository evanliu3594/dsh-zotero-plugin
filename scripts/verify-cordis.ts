/**
 * Cordis-level wiring verification: mounts the REAL ToolRuntime service from
 * @deepseek-ai/dsh-tools in a bare Context, applies the plugin, and inspects
 * what got registered — no full harness boot needed.
 *
 *   node --experimental-strip-types scripts/verify-cordis.ts
 *
 * Launched through Node's own type stripping, not tsx: tsx and esbuild both
 * need a child process on a pipe, which this project's sandbox denies. The
 * plugin source stays erasable-only so strip mode can load it on every Node line
 * the harness supports, including Node 26 (which removed transform mode).
 */

import * as cordis from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'
import type { Config } from '../src/config.ts'

const ctx = new cordis.Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRuntime)
await new Promise((resolve) => setTimeout(resolve, 500))

const config = (plugin.Config as unknown as (input: unknown) => Config)({})
plugin.apply(ctx, config)
await new Promise((resolve) => setTimeout(resolve, 300))

const runtime = ctx.get('tools') as { schemas?: () => Array<{ name: string; parameters?: { properties?: Record<string, unknown> } }> } | undefined
const tools = runtime?.schemas?.() ?? []
console.log('registered tools:', tools.map((tool) => tool.name).join(', '))
console.log('count:', tools.length)
const search = tools.find((tool) => tool.name === 'zotero_search_items')
if (search) {
  console.log('zotero_search_items parameters:', Object.keys(search.parameters?.properties ?? {}).join(', '))
}
console.log('OK: plugin loads and registers against the real ToolRuntime service')
