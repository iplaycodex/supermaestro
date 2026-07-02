---
name: lanhu-export
description: 用于从蓝湖 Lanhu 项目 stage 链接按版本分组导出设计稿资料。适用于用户提到蓝湖设计稿、Lanhu project/stage 链接、V3.x 版本分组、批量下载设计稿数据、schema、画板清单、按需图片基线时。
---

# 蓝湖版本分组导出

## 目标

把蓝湖项目页里的某个版本分组导出成本地稳定资料包。默认只导出画板清单和 schema，不下载图片：

- `manifest.json`: 分组、画板、版本和 schema 下载结果索引。
- `schemas/*.json`: 每个画板的结构化 schema，用于量尺寸和查节点。
- `images/*`: 仅在用户明确需要视觉验收基线或传 `--with-images` 时导出。

这个 skill 不负责生成页面代码。若用户只给单个带 `version_id` 的蓝湖链接并要求还原页面，可以走已有单画板 schema 流程。

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

不要把 Cookie、token、账号信息写进仓库、日志、manifest 或最终回复。Cookie 文件应放在 gitignored 的本地路径，例如：

```text
~/.codex/lanhu-cookie.txt
```

脚本也兼容旧的本机路径 `~/.codex/skills/lanhu-to-page/assets/cookie.txt`。

如果接口返回无权限、401、403、空响应或 HTML 登录页，停止后说明需要更新蓝湖 Cookie。

## 导出流程

1. 解析用户给出的 stage URL，拿到 `tid` 和 `pid`。
2. 用 `project_sectors` 拉项目分组树。
3. 优先精确匹配用户指定分组名，例如 `v3.9.4 （鱼乐卡改版和话题pk）`。如果用户只给 `v3.9.4 鱼乐卡` 这类缩写，先用 `--dry-run` 查看候选；只有唯一候选明显命中时才加 `--allow-fuzzy-group`。
4. 从分组树提取该分组下的画板；如果树里没有画板明细，再用 `project/image` 按 `sector_id` 等候选参数补取。
5. 对每个画板取详情，记录 `image_id`、画板名、当前/最新 `version_id` 和历史版本信息。
6. 对每个 `version_id` 请求 `store_schema_revise`，再下载 `data_resource_url` 对应 schema。
7. 默认不下载图片，也不在 manifest 记录 `image_url` / `image_path`。只有用户明确要求图片基线时才传 `--with-images`。
8. 输出 `manifest.json`，并在回复里说明导出数量、失败项和 Cookie/权限问题。manifest 默认写相对路径，方便整个资料包移动；只有外部工具明确依赖绝对路径时才使用 `--absolute-paths`。

## 脚本

优先运行 bundled script，避免手写易错接口流程：

```bash
node "<skill-dir>/scripts/lanhu-export.mjs" \
  --url "https://lanhuapp.com/web/#/item/project/stage?tid=...&pid=..." \
  --group "v3.9.4 （鱼乐卡改版和话题pk）" \
  --out "documents/v3.9.4 （鱼乐卡改版和话题pk）/ui" \
  --cookie-file "$HOME/.codex/lanhu-cookie.txt"
```

可选参数：

- `--dry-run`: 只生成 manifest，不下载 schema 和图片。
- `--with-images`: 显式下载图片并写入 `image_url` / `image_path`；默认不要加。
- `--no-images`: 兼容旧命令；现在默认已经不下载图片。
- `--no-schema`: 不下载 schema，只导出画板清单；如果同时需要图片，必须再加 `--with-images`。
- `--allow-fuzzy-group`: 精确匹配失败时，允许唯一关键词候选自动匹配；多个候选时仍失败，避免导错分组。
- `--absolute-paths`: manifest 中写入绝对路径；默认写相对路径，便于移动 `ui/` 资料包。
- `--include-all-if-group-empty`: 分组下无法识别画板时允许导出项目全部画板；默认不要用，避免把 246 张全量图误当版本资料。

脚本输出路径：

```text
<out>/
  manifest.json
  schemas/
  images/  # 仅 --with-images 时生成
```

输出目录优先按用户指定的需求/版本/tab 建立，例如 `documents/<蓝湖分组名>/ui`。只有用户明确要求复用已有需求目录时，才把 `ui/` 放进已有目录，避免 manifest 生成后再移动导致路径失真。

## 视觉验收建议

默认资料包不包含图片。只有要做视觉验收或像素对比时，才用 `--with-images` 单独导出蓝湖画板图片作为基线；不要直接截 stage 页面，因为 stage/详情页缩放比例会变化。

做小程序视觉对比前，先固定：

- mock 数据和接口响应。
- 时间、状态栏、导航栏、头像、投票数、评论数。
- 设备宽度和 DPR。
- 页面滚动位置。

实际对比可以用 `pixelmatch`、`odiff` 或团队现有截图工具，输出 `actual.png`、`expected.png`、`diff.png`。

## 边界

- 不自动提交导出的设计资料，除非用户明确要求。
- 不把蓝湖 Cookie 写入 `manifest.json`。
- Cookie 文件可以带本地说明文字；脚本会自动选取第一条可作为 HTTP Cookie header 的有效行，但回复和 manifest 仍不能泄露 Cookie。
- 默认不导出图片；不要为了“资料完整”主动加 `--with-images`。
- 只有显式导出图片后，才可以讨论视觉基线完整性；不因为某张图片下载失败就声称视觉基线完整。
- 如果蓝湖接口字段变化，先用浏览器/电脑插件只读确认页面和 URL 参数，再调整脚本。
