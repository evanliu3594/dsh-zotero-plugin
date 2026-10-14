# Changelog

## Unreleased

### 修复

- **空字符串 key 会让 bibtex 导出整个文库。** `src/tools.ts` 原来只校验 key 数量不校验内容；`client.buildApiUrl` 会跳过空参数值，于是 `itemKeys: ['']` 的 `itemKey` 参数被丢弃，请求退化成不带过滤的 `items?format=bibtex`。实测经真实 ToolRuntime 调用返回 `count=1685`、正文 6 433 619 字符（旧产物对照，耗时约 2.1 秒）。现在先校验每个 key 是 8 位字母数字，非法 key 直接报错。同一路径下不存在的 key 也不再静默：先用元数据探测逐 key 判定 404 并写进 `failedKeys`，全部缺失时返回空 `export`。
- **`zotero_get_bibtex` 的 CSL-JSON 多条目导出会返回未请求的条目。** 原实现用一次 `items?itemKey=k1,k2&format=csljson` 请求。Zotero 10.0.6 的本地 API 对 csljson 不按 `itemKey` 过滤：实测请求 2 个 key 返回 4 条，其中 2 条完全无关。同一组 key 走 bibtex 正常。现在 CSL-JSON 逐 key 请求，并加结构性守卫——单个条目请求若返回多条即中止，因为那说明该端点又不再过滤（该响应体不含条目 key，无法事后按 key 校验）。bibtex 保持单次逗号列表请求。输出新增 `requested` 与 `failedKeys` 字段；重复 key 去重。
- **工具输出里取值为 `undefined` 的属性被 harness 拒收。** harness 校验工具结果必须是 lossless JSON，实测 `zotero_search_items {itemType:'note', scope:'all'}`（note 行没有 `data.title`）与 `zotero_list_collections`（顶层集合没有 `parentCollection`）都会返回 `ToolOutputError INVALID_TOOL_OUTPUT`，后者是默认调用即失败。现在凡是可能取不到值的字段都改为「有值才输出」，覆盖三个投影函数、集合投影、`zotero_search_items`/`zotero_recent_items` 的 `total`、`zotero_get_item` 的信封、`zotero_status` 的 `zoteroVersion`/`libraryName`、`zotero_get_selected_collection` 与 `zotero_add_item` 的 `unsuccessful`。`total` 另加整数与符号守卫（`Number.isInteger` + 非负 + 非 `-0`），畸形 `Total-Results` 头不会再产生 NaN、非整数或 `-0`。`zotero_add_item` 读回新条目时过滤掉没有 key 的行，`createdKeys` 不再写入 `undefined`。
- **`tsc --noEmit` 报 26 个错误，且项目没有 typecheck 脚本，所以长期无人发现。** 三个根因：`jsonRender` 返回的字面量 `type` 被推断成 `string`，而 `TextBlock` 要求 `'text'`（10 个工具各报一次）；`compactItem`/`attachmentInfo`/`noteInfo` 返回 `Record<string, unknown>`，与工具输出 schema 推断出的 `JsonValue` 不兼容；`apiAll` 的元素类型是 `unknown`，使集合/标签工具读字段失败。现在新增插件本地的 `JsonValue`/`JsonObject`，并新增 `pnpm typecheck`。
- **`pnpm verify` 与 `pnpm smoke` 在受限沙箱下必然失败。** 两者经 tsx 启动，而 tsx 与 esbuild 都要在管道上起子进程。改为 `node --experimental-strip-types` 后可在本机默认沙箱内运行。为此 `src/client.ts` 去掉两处构造器参数属性，使插件源码保持可擦除语法——这也是 Node 26 的唯一选择（Node 26 移除了 transform 模式）。
- **插件此前无法在打包桌面版里加载。** `main` 指向裸 TypeScript `src/index.ts`，而官方运行时不做任何 TypeScript transform：vendor/loader 是裸 `import()`，`apps/desktop` 起的是已构建的 `lib/index.js`，harness 的生产不变量测试还主动传 `--no-experimental-strip-types` 证明产品组合加载零个 `.ts`。现在 `pnpm build` 用 esbuild 产出 `lib/index.js`（`@deepseek-ai/*` 全部 external、不声明 peerDependencies），`main`/`exports` 指向它。
- **`pnpm probe` 此前是假绿。** 它只 import 链接的框架包，从不按包名加载本插件；`pnpm verify` 走相对路径 `../src/index.ts`，绕过 `exports`/`main`。两者可以在安装路径已经坏掉的情况下同时通过。probe 现在按**包名**在纯 node 下加载**构建产物**、检查产物相对 `src/` 的新鲜度、并对真实 ToolRuntime 断言 10 个 `zotero_*` 工具全部注册。probe 覆盖 artifact 面、verify 覆盖 source 面，刻意不混。

### 变更

- `pnpm-workspace.yaml` 的 `allowBuilds` 把 esbuild 的 postinstall 改为不执行：该脚本只用 `esbuild --version` 校验平台二进制，而二进制已随 `@esbuild/win32-x64` 可选依赖一起安装，校验本身还依赖一个在受限沙箱里会被拒的子进程。不做此设置时 `pnpm <任何脚本>` 都会连带执行该校验并整体失败。
- `tsconfig.json` 增加 `paths` 映射指向 harness checkout 的源码与声明：构建产物的 `.d.ts` 互相 `import './x.ts'`（这些文件并不存在），直接读声明会让类型检查失去模块身份，把每个工具的 render 都报成不相关的函数类型。映射只服务类型检查，运行时仍走 junction 加载 `lib/`。
- 移除 devDependency `tsx`：项目内已无调用方。
- 装进 profile 前必须先 `pnpm build`：`dsh plugin add <本地路径>` 只让 pnpm `link:` 目录、不跑构建。README 的安装步骤已同步。
- 新增 devDependency `esbuild`。

## 0.1.0 — 2026-10-01

首版。10 个 `zotero_*` 工具：

- 读取（Zotero 本地 API，只读）：`zotero_status`、`zotero_search_items`（全文/标签/集合/类型过滤、翻页、垃圾桶）、`zotero_get_item`、`zotero_get_children`、`zotero_list_collections`、`zotero_list_tags`、`zotero_recent_items`、`zotero_get_bibtex`（BibTeX / CSL-JSON）。
- 写入（connector `saveItems`，纯 localhost）：`zotero_add_item`（一次一条，保存后读回校验）、`zotero_get_selected_collection`。
- 在 DeepSeek Harness 桌面版 0.2.0-rc.2 + Zotero 10.0.3 上实测通过。
