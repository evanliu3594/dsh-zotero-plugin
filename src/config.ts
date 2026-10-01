import Schema from '@deepseek-ai/schemastery'

/** All tunables live here — no magic constants in the tool bodies. */
export interface Config {
  /** Zotero desktop HTTP host. */
  host: string
  /** Zotero local server port (Zotero 的连接器端口，默认 23119）。 */
  port: number
  /** 本地 API 文库 id；`0` 即本机当前用户文库。 */
  libraryId: string
  /** 单次 HTTP 请求超时（毫秒）。 */
  timeoutMs: number
  /** 列表类工具默认页大小。 */
  defaultLimit: number
  /** 单次调用允许的最大页大小。 */
  maxLimit: number
  /** 搜索结果里摘要预览的字符数（0 = 不返回摘要）。 */
  abstractPreviewChars: number
  /** 集合/标签全量拉取的行数上限（分页自动循环直到该上限）。 */
  listCap: number
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string().default('127.0.0.1').description('Zotero 桌面端 HTTP 主机'),
  port: Schema.number().min(1).max(65535).default(23119).description('Zotero 本地服务端口（默认 23119）'),
  libraryId: Schema.string().default('0').description("本地 API 文库 id，'0' 表示本机当前用户文库"),
  timeoutMs: Schema.number().min(1000).max(120000).default(15000).description('单请求超时（毫秒）'),
  defaultLimit: Schema.number().min(1).max(100).default(25).description('列表默认页大小'),
  maxLimit: Schema.number().min(1).max(500).default(100).description('单次调用的最大页大小'),
  abstractPreviewChars: Schema.number().min(0).max(5000).default(300).description('搜索结果摘要预览长度（0 = 不返回摘要）'),
  listCap: Schema.number().min(100).max(5000).default(1000).description('集合/标签全量拉取上限'),
}).description('dsh-zotero 插件配置')
