# Changelog

## 0.1.0 — 2026-10-01

首版。10 个 `zotero_*` 工具：

- 读取（Zotero 本地 API，只读）：`zotero_status`、`zotero_search_items`（全文/标签/集合/类型过滤、翻页、垃圾桶）、`zotero_get_item`、`zotero_get_children`、`zotero_list_collections`、`zotero_list_tags`、`zotero_recent_items`、`zotero_get_bibtex`（BibTeX / CSL-JSON）。
- 写入（connector `saveItems`，纯 localhost）：`zotero_add_item`（一次一条，保存后读回校验）、`zotero_get_selected_collection`。
- 在 DeepSeek Harness 桌面版 0.2.0-rc.2 + Zotero 10.0.3 上实测通过。
