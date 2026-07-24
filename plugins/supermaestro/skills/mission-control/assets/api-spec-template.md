# API 规格

## 摘要

- 需求：
- 原始接口物料：
- 接口文档入口：
- Discovery 状态：pending / partial / complete / blocked
- Discovery 产物：
- 规格更新时间：
- 当前状态：pending

## API 发现

当原始物料是接口文档地址、Knife4j/Swagger/OpenAPI/Postman 链接或网关地址时，Scope Gate 前必须先尝试解析到真实接口清单；不要把“F1 再发现接口”当成默认计划。

| 来源 | 类型 | 尝试方式 | 结果 | 缓存/引用 | 备注 |
| --- | --- | --- | --- | --- | --- |
|  | Knife4j / Swagger / OpenAPI / Postman / Markdown / mock | `swagger-resources` / `/v3/api-docs` / `/v2/api-docs` / 手工解析 | pending |  |  |

Discovery 结论：

- 可实现接口：
- 未覆盖接口：
- 解析失败/受限原因：
- 是否阻塞 Scope Gate：

## 接口清单

| 编号 | 归属 | 方法 | 路径 | 名称/用途 | 调用页面/模块 | 关联 UI/任务 | 契约状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-1 | public-foundation / page-specific / shared-domain / backoffice / out-of-scope / unclear |  |  |  |  |  | pending |  |

## 接口详情

### API-1 <接口名称>

- 方法与路径：
- 用途：
- 调用方：
- 归属分类：public-foundation / page-specific / shared-domain / backoffice / out-of-scope / unclear
- 页面/模块：
- 关联 UI 画板/schema：
- 鉴权/登录态：
- 请求时机：
- 契约状态：confirmed / inferred / missing / blocked

入参：

| 字段 | 位置 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- | --- |
|  | query/body/path/header |  |  |  |  |

出参：

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

异常/空态：

| 场景 | 后端表现 | 前端处理 | 验证方式 |
| --- | --- | --- | --- |
|  |  |  |  |

Mock 场景：

| 场景 | mock 文件/规则 | 期望 UI/行为 |
| --- | --- | --- |
|  |  |  |

## 数据模型

### <ModelName>

| 字段 | 类型 | 必填 | 来源接口 | 说明 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 页面/任务映射

| 页面/模块/任务 | 使用接口 | 依赖字段 | UI 画板/schema | 降级/空态 | 验证要求 |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

> 如果同时存在 API 物料和 UI 物料，多页面/多模块需求必须同步维护 `specs/page-contract-matrix.md`，这里仅保留接口视角摘要。

## 待确认问题

- 
