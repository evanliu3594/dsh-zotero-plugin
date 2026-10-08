# Changelog

## Unreleased

### 修复

- **插件此前无法在打包桌面版里加载。** `main` 指向裸 TypeScript `src/index.ts`，而官方运行时不做任何 TypeScript transform：vendor/loader 是裸 `import()`，`apps/desktop` 起的是已构建的 `lib/index.js`，harness 的生产不变量测试还主动传 `--no-experimental-strip-types` 证明产品组合加载零个 `.ts`。退一步说 `src/client.ts` 的参数属性连 Node 24 的 strip-only 模式都过不去（`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`）。现在 `pnpm build` 用 esbuild 产出 `lib/index.js`（`@deepseek-ai/*` 全部 external、不声明 peerDependencies），`main`/`exports` 指向它。`src/` 保留给 tsx dev overlay。
- **`pnpm probe` 此前是假绿。** 它只 import 链接的框架包，从不按包名加载本插件；`pnpm verify` 走相对路径 `../src/index.ts`，绕过 `exports`/`main`。两者可以在安装路径已经坏掉的情况下同时通过。probe 现在按**包名**在纯 node 下加载**构建产物**、检查产物相对 `src/` 的新鲜度、并对真实 ToolRuntime 断言 10 个 `zotero_*` 工具全部注册。probe 覆盖 artifact 面、verify 覆盖 source 面，刻意不混。

### 变更

- 装进 profile 前必须先 `pnpm build`：`dsh plugin add <本地路径>` 只让 pnpm `link:` 目录、不跑构建。README 的安装步骤与 AGENTS.md 的开发流程已同步。
- 新增 devDependency `esbuild`。

## 0.1.0 — 2026-10-01

首版。10 个 `zotero_*` 工具：

- 读取（Zotero 本地 API，只读）：`zotero_status`、`zotero_search_items`（全文/标签/集合/类型过滤、翻页、垃圾桶）、`zotero_get_item`、`zotero_get_children`、`zotero_list_collections`、`zotero_list_tags`、`zotero_recent_items`、`zotero_get_bibtex`（BibTeX / CSL-JSON）。
- 写入（connector `saveItems`，纯 localhost）：`zotero_add_item`（一次一条，保存后读回校验）、`zotero_get_selected_collection`。
- 在 DeepSeek Harness 桌面版 0.2.0-rc.2 + Zotero 10.0.3 上实测通过。
