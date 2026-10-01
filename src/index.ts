/**
 * dsh-zotero — Zotero library tools for DeepSeek Harness, talking to the local
 * Zotero desktop server on 127.0.0.1:23119 only (no cloud calls, no API key).
 *
 * Dev loading (from the harness repo root):
 *   pnpm run start:web --patch ./zotero-plugin/cordis.yml
 *
 * Everything registered here lives in one effect scope, so unloading the
 * plugin (config edit / HMR / shutdown) unregisters all ten tools automatically.
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { ZoteroLocalClient } from './client.ts'
import { Config, type Config as ConfigShape } from './config.ts'
import { buildTools } from './tools.ts'

export const name = 'zotero'
export const inject = ['tools']

export { Config }

export function apply(ctx: Context, config: ConfigShape) {
  const client = new ZoteroLocalClient(config)
  const tools = buildTools(client, config)
  for (const tool of tools) ctx.tools.register(tool)
  ctx.logger.info(
    `[dsh-zotero] ${tools.length} 个 Zotero 工具已注册 → http://${config.host}:${config.port} (library=${config.libraryId})`,
  )
}
