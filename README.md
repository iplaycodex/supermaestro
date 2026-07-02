# SuperMaestro

SuperMaestro 是一个 Codex 插件，用来把 PRD、接口文档、蓝湖/UI 物料整理成可审查、可暂停、可恢复的需求工作台，并通过 Gate、Review Pack 和验证记录推进研发任务。

## 包含的 Skills

- `requirement-intake`：需求接收入口，负责收集 PRD/API/UI 物料，并创建 `mission-control` 可用的工作台。
- `export-lanhu-version`：按蓝湖版本分组导出设计资料，默认只导出 `manifest.json` 和 `schemas/*.json`。
- `prd-structure`：把 PRD 抽取为可审查、可追溯的结构化需求事实包。
- `mission-control`：负责阶段规划、Human Gate、Review Pack、worktree 策略、验证记录和交接。

## 典型用法

```text
使用 $requirement-intake 处理这个需求：PRD 在 <path/link>，接口文档在 <path/link>，蓝湖链接是 <url>，目标仓库是 <repo>。请生成 documents/<需求名>/source 和 workbench，先停在 Gate 1。
```

## 默认工作台结构

```text
documents/<需求同名目录>/
├── source/
│   ├── prd/
│   ├── api/
│   └── ui/
└── workbench/
```

默认只整理物料并生成 Gate 1 规划，不会自动编码、创建 worktree、提交、合并或推送。
