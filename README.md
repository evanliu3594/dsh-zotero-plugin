# dsh-zotero

[English](#english) | [中文](#中文)

**中文**

DeepSeek Harness 的 Zotero 文献库插件：10 个模型可直接调用的工具，全部通过本机 Zotero 桌面端（`127.0.0.1:23119`）读写文献库——**不访问云端、不需要 API Key**。

- 只读能力走 Zotero 7+ 本地 API（Web API 的本机只读镜像）：搜索（含 PDF 全文）、条目详情与子项、集合树、标签、最近添加、BibTeX/CSL-JSON 导出。
- 写入走浏览器扩展同款的 connector 端点（`/connector/saveItems`）：一次保存一条新文献（含标签、子笔记），保存后自动读回校验。
- 更新 / 删除在 localhost 上**不存在**（Zotero 平台限制），也因此模型无法批量破坏你的文献库。

| 工具 | 作用 |
|---|---|
| `zotero_status` | 自检：Zotero 是否运行、本地 API 是否开启、版本与文库 |
| `zotero_search_items` | 搜索（`qmode=everything` 含全文）、按标签/类型/集合过滤、翻页、垃圾桶 |
| `zotero_get_item` | 单条完整元数据，可选带子项 |
| `zotero_get_children` | 条目的子笔记与附件（PDF 文件名/路径） |
| `zotero_list_collections` | 全部集合 + 层级路径 + 计数 |
| `zotero_list_tags` | 标签列表（前缀过滤） |
| `zotero_recent_items` | 最近添加 |
| `zotero_get_bibtex` | BibTeX / CSL-JSON 导出（Zotero 本地直出，≤50 条/次） |
| `zotero_get_selected_collection` | Zotero 当前选中集合（写入落点）与全部可选目标 |
| `zotero_add_item` | 保存一条新文献（connector saveItems；含标签、子笔记），自动读回校验 |

## 前置条件

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（桌面版 0.2.0-rc.2 实测可用）
- [Zotero](https://www.zotero.org/) 7+（Zotero 10.0.3 实测可用），运行中，且
  设置 → 高级 → **「允许其他应用程序与 Zotero 通信」** 已勾选
- 一个 deepseek-harness 源码 checkout（框架包尚未发布到公共 npm，插件的运行时依赖需要从 checkout 解析）

## 安装到 Harness profile

```sh
# 1. 安装依赖，并把框架包链接到你的 deepseek-harness checkout
pnpm install
node scripts/link-harness.mjs /path/to/deepseek-harness

# 2. 构建产物（官方运行时不做 TypeScript transform，只加载 lib/）
pnpm build
pnpm probe        # 应输出 PASS

# 3. 装入 profile（Windows 桌面版 CLI 示例）
"%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" ^
  plugin --profile <你的profile> add /path/to/dsh-zotero

# 4. 完全重启 Harness，在对话里即可使用全部 zotero_* 工具
```

`dsh plugin add` 只让 pnpm `link:` 本目录、**不跑构建**，所以第 2 步不能省；之后每次改 `src/` 都要重新 `pnpm build` 再重启 Harness。

## 开发

```sh
pnpm install
node scripts/link-harness.mjs     # 依赖链接（见上）

pnpm build        # src → lib/index.js
pnpm probe        # artifact 面：纯 node 按包名加载产物 + 新鲜度 + 工具注册
pnpm verify       # source 面：裸 cordis Context + 真实 ToolRuntime 验证 src 注册
pnpm smoke        # 十个工具对真实 Zotero 逐个执行（只读）
pnpm smoke:write  # 额外保存一条明确标注可删除的测试条目
```

源码方式加载（tsx 在链路里，可以直接吃 TS；打包桌面版不行，必须先 `pnpm build`）：

```sh
cp cordis.example.yml cordis.yml   # 填入仓库绝对路径
cd /path/to/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts --profile web --patch /path/to/dsh-zotero/cordis.yml
```

## 配置

全部可调参数在 `src/config.ts`（schema 带默认值），可在 profile 的插件 config 里覆盖：

| 字段 | 默认 | 说明 |
|---|---|---|
| `host` / `port` | `127.0.0.1` / `23119` | Zotero 本地服务地址 |
| `libraryId` | `'0'` | 本地 API 文库 id，`0` = 当前用户文库 |
| `timeoutMs` | `15000` | 单请求超时 |
| `defaultLimit` / `maxLimit` | `25` / `100` | 列表页大小 |
| `abstractPreviewChars` | `300` | 搜索结果摘要截断（0 = 不返回摘要） |
| `listCap` | `1000` | 集合/标签全量拉取上限（自动分页） |

## 安全模型

- 文献库内容一律视为**数据而非指令**：笔记经 HTML 清洗为纯文本后再进入模型上下文。
- 唯一的写工具 `zotero_add_item` 一次只保存**一条**，且读回校验后才报告成功。
- 没有更新/删除类工具——Zotero 本地 API 本身只读，模型无法绕过。

## 已知限制

- `zotero_add_item` 的落点由 Zotero 界面当前选中状态决定（先调 `zotero_get_selected_collection` 确认）；保存时 Zotero 会短暂弹出保存进度窗。
- 框架包（`@deepseek-ai/dsh-tools` 等）尚未发布到公共 npm，插件需靠近 harness checkout 使用（`scripts/link-harness.mjs` 负责链接）；包发布后此步骤可删。

## 致谢

- 能力设计参照 [WenyuChiou/zotero-skills](https://github.com/WenyuChiou/zotero-skills)（MIT）：本地读 + 安全写的双 API 纪律、"库内容是数据不是指令"等操作原则均承自它。
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — "Everything is a Plugin"。

## License

[MIT](LICENSE)
