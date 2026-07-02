# 结构化 PRD 推荐 Schema

## 顶层结构

```json
{
  "meta": {},
  "source_documents": [],
  "summary": {},
  "modules": [],
  "entities": [],
  "rules": [],
  "states": [],
  "fields": [],
  "apis": [],
  "ui": [],
  "analytics": [],
  "acceptance": [],
  "open_questions": [],
  "source_map": [],
  "quality": {}
}
```

## 通用条目字段

每个事实条目都应包含：

```json
{
  "id": "RULE-001",
  "type": "business_rule",
  "summary": "",
  "detail": "",
  "source_ref": {
    "file": "source/prd/original.md",
    "heading": "",
    "line_start": 1,
    "line_end": 1,
    "quote": ""
  },
  "confidence": "high|medium|low",
  "review_status": "pending|accepted|corrected|rejected|unclear",
  "human_note": ""
}
```

`quote` 只放短摘录，不要整段复制。无法给行号时，用章节、表格名、图片编号或锚点替代。

## 常用对象

### module

```json
{
  "id": "MOD-SIGNIN",
  "name": "每日签到",
  "kind": "page|flow|admin|config|analytics|entry",
  "scope": "in_scope|out_of_scope|unclear",
  "rules": ["RULE-001"],
  "states": ["STATE-001"],
  "fields": ["FIELD-001"],
  "source_ref": {}
}
```

### rule

```json
{
  "id": "RULE-SIGNIN-CYCLE",
  "module_id": "MOD-SIGNIN",
  "category": "display|business|reward|permission|sorting|expiry|notification",
  "condition": "",
  "behavior": "",
  "exceptions": [],
  "source_ref": {},
  "confidence": "high",
  "review_status": "pending"
}
```

### state

```json
{
  "id": "STATE-TASK-CLAIM",
  "entity": "task",
  "states": ["unfinished", "completed_unclaimed", "claimed", "expired"],
  "transitions": [
    {
      "from": "completed_unclaimed",
      "to": "claimed",
      "trigger": "user_claim_reward",
      "result": "show_success_modal"
    }
  ],
  "source_ref": {}
}
```

### task config

```json
{
  "id": "TASK-CONFIG-001",
  "title": "",
  "is_new_task": true,
  "task_type": "",
  "audience": "",
  "threshold": "",
  "reward": {
    "type": "points|growth_value|coupon|unknown",
    "value": null,
    "name": ""
  },
  "group": "newbie|recommended|daily|unknown",
  "cycle": "once|daily|weekly|monthly|yearly|infinite|unknown",
  "channels": [],
  "jump": {
    "type": "native|h5|toast|modal|custom|unknown",
    "target": ""
  },
  "source_ref": {},
  "review_status": "pending"
}
```

### acceptance

```json
{
  "id": "AC-001",
  "module_id": "",
  "given": "",
  "when": "",
  "then": "",
  "coverage": "explicit|derived|missing",
  "source_ref": {},
  "review_status": "pending"
}
```

## 输出约束

- JSON 必须可解析，不要混入 Markdown 注释。
- 缺失字段用 `null`、空数组或 `unknown`，不要编造。
- 原文有错别字、矛盾或 OCR 噪音时，保留原文定位，并把规范化理解写入 `human_note` 或 `open_questions`。
- 对任务、奖励、状态这类可执行规则，优先结构化成枚举和状态机，而不是长文本摘要。
