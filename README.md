# SuperMaestro

SuperMaestro 是一个 Codex 插件，用来把 PRD、接口文档、蓝湖/UI 物料整理成可审查、可暂停、可恢复的需求工作台，并通过 Gate、Review Pack 和验证记录推进研发任务。

## 设计分层

SuperMaestro 当前按三层演进：

```text
profiles/      通用 workflow 与项目领域规则
scripts/       机器状态、Gate 和动作检查
skills/        Codex 入口和协作协议
templates/     人类审阅投影模板
references/    执行模式、worktree、agent、验证参考
```

核心原则是：`state.json + events.jsonl` 作为机器状态，Markdown 作为人类审阅投影。Codex 可以读 Markdown 工作，但关键 Gate 和危险动作必须优先通过脚本检查。

## 包含的 Skills

- `requirement-workbench`：需求接收入口，负责收集 PRD/API/UI 物料，并创建 `mission-control` 可用的工作台。
- `lanhu-export`：按蓝湖版本分组导出设计资料，默认只导出 `manifest.json` 和 `schemas/*.json`。
- `prd-structure`：把 PRD 抽取为可审查、可追溯的结构化需求事实包。
- `mission-control`：负责阶段规划、Human Gate、Review Pack、worktree 策略、验证记录和交接。

## 仓库结构

```text
supermaestro/
├── .agents/plugins/marketplace.json
└── plugins/supermaestro/
    ├── .codex-plugin/plugin.json
    ├── profiles/
    ├── references/
    ├── scripts/
    ├── skills/
    └── templates/
```

Codex 通过 `.agents/plugins/marketplace.json` 发现本仓库里的插件，再按 `./plugins/supermaestro` 找到插件本体。

## 安装

```bash
codex plugin marketplace add git@github.com:iplaycodex/supermaestro.git
codex plugin add supermaestro@supermaestro
```

本地调试时也可以把 marketplace 指向当前仓库路径：

```bash
codex plugin marketplace add <supermaestro 仓库路径>
codex plugin add supermaestro@supermaestro
```

## 典型用法

```text
使用 $requirement-workbench 处理这个需求：PRD 在 <path/link>，接口文档在 <path/link>，蓝湖链接是 <url>，目标仓库是 <repo>。请生成 documents/<需求名>/source 和 workbench，先停在 Gate 1。
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

## CLI-first 状态机

插件内置轻量 CLI：

```bash
node plugins/supermaestro/scripts/supermaestro.js init <workbench> --name "<需求名>"
node plugins/supermaestro/scripts/supermaestro.js status <workbench>
node plugins/supermaestro/scripts/supermaestro.js next <workbench>
node plugins/supermaestro/scripts/supermaestro.js check-workbench <workbench>
node plugins/supermaestro/scripts/supermaestro.js approve-gate1 <workbench> --mode main-serial --confirmed-by user --confirmation "<用户确认原话或摘要>"
node plugins/supermaestro/scripts/supermaestro.js verify <workbench> --strict true
node plugins/supermaestro/scripts/supermaestro.js request-gate2 <workbench>
```

CLI 会生成或更新：

```text
workbench/state.json
workbench/events.jsonl
workbench/mission.state.json
workbench/gates/*.json
```
