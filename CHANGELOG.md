# 变更日志

本文件记录 SuperMaestro 面向用户和维护者的可见变化。版本遵循语义化版本；
尚未正式发布的改动先放在“未发布”部分。

## 2.0.1（未发布）

### 安全

- 蓝湖 Cookie 只发送到 HTTPS 的 `lanhuapp.com` 或其点分子域，拒绝跨域资源、
  非默认端口和重定向。
- `inspect-ui` 限制 manifest、schema、图片和 symlink 的真实路径边界。
- 蓝湖画板部分失败默认返回非零退出码，只有显式 `--allow-partial` 才允许继续。

### 修复

- Final Gate 按 `commit`、`merge`、`push`、`cleanup` 分别授权。
- Scope、Plan、Review、Final 四道门禁都要求独立用户确认。
- 工作流模式初始化后不可通过 `init` 或 `scaffold` 降级。
- Review artifact 必须真实存在且非空；普通验证绑定当前源码指纹与产物哈希。
- API discovery 与可执行 API contract 分别归属 Scope、Plan 阶段。
- `strict + UI` 必须明确记录视觉验证决策。

### 工程

- 旧 `harness.js` 改为主 CLI 兼容适配器，移除第二套机器状态写入。
- 工作台状态升级为 `workflowVersion: 3`；旧版 v2 只能通过 `init` 显式迁移，
  原始物料保持不变，Plan、Review、Final 授权全部重置。
- worktree 动作绑定精确目标、分支、基线和 owned registry，不再只依赖布尔开关。
- 六个 Skill 的正文和 UI 元数据完成中文化。
- CI 覆盖 Ubuntu、Windows 与 Node.js 18、20，并运行官方插件和 Skill 校验器。
- 移除无引用的重复 references、templates 和临时写权限探针文件。
