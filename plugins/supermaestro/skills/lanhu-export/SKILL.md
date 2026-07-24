---
name: lanhu-export
description: 用于从蓝湖 Lanhu 项目的 stage 链接按版本分组导出设计稿资料。适用于用户提到蓝湖设计稿、Lanhu 项目或 stage 链接、V3.x 版本分组、批量下载设计稿数据、schema、画板清单、按需图片基线时。
---

# 蓝湖版本分组导出

## 目标

把蓝湖项目页里的某个版本分组导出成本地稳定资料包。默认只导出画板清单和 schema，不下载图片：

- `manifest.json`: 分组、画板、版本和 schema 下载结果索引。
- `schemas/*.json`: 每个画板的结构化 schema，用于量尺寸和查节点。
- `images/*`: 仅在用户明确需要视觉验收基线或传 `--with-images` 时导出。

本能力不负责生成页面代码。若用户只给单个带 `version_id` 的蓝湖链接并要求还原页面，可以走已有的单画板 schema 流程。

## 触发条件

在以下情况使用本 Skill：

- 用户提供蓝湖 stage 链接，并要求按版本或分组导出。
- 需求工作台需要蓝湖画板清单、schema 或视觉基线。
- 用户需要先盘点某个分组包含哪些画板，再决定实现范围。

只有单张截图、没有蓝湖链接，或任务只是实现已有设计资料时，不要触发导出。

## 输入

必需输入：

- 蓝湖 stage 链接，至少可解析出 `team_id` 和 `project_id`。
- 目标分组的完整名称，或足以唯一匹配的版本/关键词。
- 输出目录。
- 有权限访问项目的 Cookie，来自用户明确提供的 Cookie 文件或 `LANHU_COOKIE`。

可选输入：

- 是否只做 `--dry-run`。
- 是否明确需要 `--with-images` 视觉基线。
- 是否需要 `--absolute-paths`。

如果分组、权限或输出范围不明确，先只读探测并返回候选或阻塞原因，不猜测导出范围。

## 信息来源

从蓝湖链接解析：

```text
https://lanhuapp.com/web/#/item/project/stage?tid=<team_id>&pid=<project_id>
```

常用接口：

```text
GET https://lanhuapp.com/api/project/project_sectors?project_id=<project_id>
GET https://lanhuapp.com/api/project/image?image_id=<image_id>&team_id=<team_id>&project_id=<project_id>
GET https://dds.lanhuapp.com/api/dds/image/store_schema_revise?version_id=<version_id>
```

`store_schema_revise` 响应里的 `data.data_resource_url` 是完整 schema JSON 地址。

## 鉴权

蓝湖项目接口需要 Cookie。优先使用用户明确提供的 Cookie 文件路径，或环境变量 `LANHU_COOKIE`。

不要把 Cookie、令牌、账号信息写进仓库、日志、manifest 或最终回复。Cookie 文件应放在项目外且访问受限的本地路径，例如：

```text
<local-config-dir>/lanhu-cookie.txt
```

脚本不扫描任何历史或隐式 Cookie 默认位置；必须由用户显式传
`--cookie-file` 或设置 `LANHU_COOKIE`，避免误用其他项目的凭据。

如果接口返回无权限、401、403、空响应或 HTML 登录页，停止后说明需要更新蓝湖 Cookie。

## 导出流程

1. 解析用户给出的 stage 链接，拿到 `tid` 和 `pid`。
2. 用 `project_sectors` 拉项目分组树。
3. 优先精确匹配用户指定分组名，例如 `v3.9.4 （鱼乐卡改版和话题pk）`。如果用户只给 `v3.9.4 鱼乐卡` 这类缩写，先用 `--dry-run` 查看候选；只有唯一候选明显命中时才加 `--allow-fuzzy-group`。
4. 从分组树提取该分组下的画板；如果树里没有画板明细，再用 `project/image` 按 `sector_id` 等候选参数补取。
5. 对每个画板取详情，记录 `image_id`、画板名、当前/最新 `version_id` 和历史版本信息。
6. 对每个 `version_id` 请求 `store_schema_revise`，再下载 `data_resource_url` 对应 schema。
7. 默认不下载图片。即使显式下载，也只在 manifest 记录本地相对 `image_path`；stage、schema 和图片的原始 URL 可能含私有参数，均不落盘。
8. 输出 `manifest.json`，并在回复里说明导出数量、失败项和 Cookie/权限问题。manifest 默认写相对路径，方便整个资料包移动；只有外部工具明确依赖绝对路径时才使用 `--absolute-paths`。

## 按需执行脚本

确认输入后，优先使用[内置导出脚本](scripts/lanhu-export.mjs)，避免手写易错的接口流程：

```bash
node "<skill-dir>/scripts/lanhu-export.mjs" --url "https://lanhuapp.com/web/#/item/project/stage?tid=...&pid=..." --group "v3.9.4 （鱼乐卡改版和话题pk）" --out "documents/v3.9.4 （鱼乐卡改版和话题pk）/ui" --cookie-file "<cookie-file>"
```

可选参数：

- `--dry-run`: 只生成 manifest，不下载 schema 和图片。
- `--with-images`: 显式下载图片并写入本地相对 `image_path`；默认不要加，不记录原始图片 URL。
- `--no-images`: 兼容旧命令；现在默认已经不下载图片。
- `--no-schema`: 不下载 schema，只导出画板清单；如果同时需要图片，必须再加 `--with-images`。
- `--allow-fuzzy-group`: 精确匹配失败时，允许唯一关键词候选自动匹配；多个候选时仍失败，避免导错分组。
- `--allow-partial`: 显式接受部分画板导出失败并让脚本返回成功；默认不要加，任一画板失败时脚本以非零退出码结束。
- `--absolute-paths`: manifest 中写入绝对路径；默认写相对路径，便于移动 `ui/` 资料包。
- `--include-all-if-group-empty`: 分组下无法识别画板时允许导出项目全部画板；默认不要用，避免把 246 张全量图误当版本资料。

脚本输出路径：

```text
<out>/
  manifest.json
  schemas/
  images/  # 仅 --with-images 时生成
```

输出目录优先按用户指定的需求、版本或页签建立，例如 `documents/<蓝湖分组名>/ui`。只有用户明确要求复用已有需求目录时，才把 `ui/` 放进已有目录，避免 manifest 生成后再移动导致路径失真。

## 输出与完成标准

成功输出至少包括：

- 可解析的 `manifest.json`，含分组、画板、版本和 schema 结果索引。
- 每个成功画板对应的 `schemas/*.json`。
- 仅在显式 `--with-images` 时出现的 `images/*`。
- 回复中的匹配分组、画板总数、成功数、失败项和输出路径。

只有脚本退出成功、manifest 可读且数量与回复一致时，才能声明导出完成。部分画板失败时默认返回失败；只有用户明确接受并使用 `--allow-partial` 时，结论才可记为 `partial`，且必须列出失败项。

## 异常与降级

- 精确分组匹配失败：先用 `--dry-run` 返回候选；只有唯一候选时才允许 `--allow-fuzzy-group`。
- 401、403、HTML 登录页或空响应：停止并请求更新 Cookie，不反复重试或输出凭证。
- schema 地址缺失或下载失败：保留画板清单并标记 `partial`，不得把缺失 schema 的画板视为可实现事实源。
- 图片下载失败：只影响视觉基线；schema-only 导出仍可继续，但必须明确没有完整视觉基线。
- 接口字段变化：先只读确认真实响应，再单独修改脚本；不要在本 Skill 执行中临时猜字段。
- 网络或权限完全不可用：返回 `blocked`、已尝试接口和恢复所需输入，不生成伪造 manifest。

## 视觉验收建议

默认资料包不包含图片。只有要做视觉验收或像素对比时，才用 `--with-images` 单独导出蓝湖画板图片作为基线；不要直接截取 stage 页面，因为 stage 页面和详情页的缩放比例会变化。

做小程序视觉对比前，先固定：

- mock 数据和接口响应。
- 时间、状态栏、导航栏、头像、投票数、评论数。
- 设备宽度和 DPR。
- 页面滚动位置。

实际对比可以用 `pixelmatch`、`odiff` 或团队现有截图工具，输出 `actual.png`、`expected.png`、`diff.png`。

## 边界

- 不自动提交导出的设计资料，除非用户明确要求。
- 不把蓝湖 Cookie 写入 `manifest.json`。
- 只允许 HTTPS 的 `lanhuapp.com` 或其点分子域作为 stage、API、schema 和图片来源；拒绝 HTTP、恶意后缀域名、URL 凭证、非默认端口、跨域资源和重定向。
- Cookie 文件可以带本地说明文字；脚本会自动选取第一条可作为 HTTP Cookie 请求头的有效行，但回复和 manifest 仍不能泄露 Cookie。
- 默认不导出图片；不要为了“资料完整”主动加 `--with-images`。
- 只有显式导出图片后，才可以讨论视觉基线完整性；不因为某张图片下载失败就声称视觉基线完整。
- 如果蓝湖接口字段变化，先用浏览器/电脑插件只读确认页面和 URL 参数，再调整脚本。
