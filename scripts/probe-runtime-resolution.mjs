/**
 * Simulates the OFFICIAL runtime's module resolution: plain Node ESM — no tsx,
 * no tsconfig paths, no TypeScript transform. vendor/loader does a bare
 * `import()`, and the harness asserts its shipped composition loads zero `.ts`,
 * so `src/*.ts` is NOT loadable under these conditions; only `lib/` is.
 *
 * Three things must hold:
 *   1. the linked `@deepseek-ai/*` runtime deps resolve and work,
 *   2. `lib/` is not stale relative to `src/`,
 *   3. the built entry — reached by BARE PACKAGE NAME through package.json
 *      `exports`, the same way a profile's `link:` dependency reaches it —
 *      loads and registers every tool against the real ToolRuntime.
 *
 * `pnpm verify` covers the source plane (relative import of src/index.ts under
 * Node type stripping); this covers the artifact plane. The two are deliberately
 * not mixed.
 *
 *   node scripts/probe-runtime-resolution.mjs
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

// (1) linked runtime deps resolve under plain node resolution
const config = Schema.object({ host: Schema.string().default('127.0.0.1') })
console.log('config default:', JSON.stringify(config({})))
const tool = defineTool({
  name: 'probe',
  description: 'probe',
  parameters: { x: { type: 'string', required: true } },
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
  async execute(args) { return args.x },
})
console.log('defineTool OK:', tool.name, typeof tool.execute)

// (2) a stale lib/ silently ships old behavior, so refuse to probe it
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const artifact = 'lib/index.js'
if (!existsSync(artifact)) {
  console.error(`FAIL: ${artifact} is missing — run \`pnpm build\` first`)
  process.exit(1)
}
const builtAt = statSync(artifact).mtimeMs
const stale = sourceFiles('src').filter((file) => statSync(file).mtimeMs > builtAt)
if (stale.length > 0) {
  console.error(`FAIL: ${artifact} is older than ${stale.length} source file(s) — run \`pnpm build\`:`)
  for (const file of stale) console.error(`  ${file}`)
  process.exit(1)
}
console.log(`freshness OK: ${artifact} is newer than all ${sourceFiles('src').length} src/**/*.ts`)

// (3) the built entry loads by bare package name and registers against the real ToolRuntime
const plugin = await import('dsh-zotero-plugin')
console.log('bare-name import OK:', Object.keys(plugin).sort().join(', '))
if (plugin.name !== 'zotero') throw new Error(`plugin.name is ${JSON.stringify(plugin.name)}, expected "zotero"`)
if (JSON.stringify(plugin.inject) !== '["tools"]') {
  throw new Error(`plugin.inject is ${JSON.stringify(plugin.inject)}, expected ["tools"] — ` +
    "declaring 'webServer' here would leave the plugin PENDING in headless profiles")
}
if (typeof plugin.Config !== 'function' || typeof plugin.apply !== 'function') {
  throw new Error('plugin must export Config and apply as functions')
}

const cordis = await import('@deepseek-ai/cordis')
const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt')
const { default: ToolRuntime } = await import('@deepseek-ai/dsh-tools')

const ctx = new cordis.Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRuntime)
await new Promise((resolve) => setTimeout(resolve, 500))

plugin.apply(ctx, plugin.Config({}))
await new Promise((resolve) => setTimeout(resolve, 300))

const runtime = ctx[ToolRuntime] ?? ctx[Symbol.for('tools')] ?? ctx.tools
const tools = runtime?.schemas?.() ?? []
const names = tools.map((t) => t.name)
console.log('registered tools:', names.join(', '))

// AGENTS.md documents exactly ten `zotero_*` tools; bumping this must be deliberate.
const EXPECTED = 10
if (names.length !== EXPECTED) {
  console.error(`FAIL: built artifact registered ${names.length} tools, expected ${EXPECTED}`)
  process.exit(1)
}
const misnamed = names.filter((name) => !name.startsWith('zotero_'))
if (misnamed.length > 0) {
  console.error(`FAIL: tool names not prefixed zotero_: ${misnamed.join(', ')}`)
  process.exit(1)
}
for (const required of ['zotero_status', 'zotero_add_item']) {
  if (!names.includes(required)) {
    console.error(`FAIL: ${required} missing from the built artifact`)
    process.exit(1)
  }
}

await (ctx.dispose?.() ?? ctx.destroy?.())
console.log('PASS: deps resolve, lib/ is fresh, and the built entry registers all ten tools under plain node resolution')
