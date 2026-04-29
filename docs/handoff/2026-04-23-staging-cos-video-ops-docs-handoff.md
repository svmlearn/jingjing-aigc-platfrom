# 2026-04-23 staging COS + Video Worker Ops Docs Handoff

## 1. 当前目标

负责 D 线文档工作，不写业务代码，只把 staging 四层架构相关的手工基础设施配置和联调验收说明整理成可以直接执行的文档，供后续真实操作的人照着做。

本轮职责范围限定为：

- 腾讯云 COS 手工配置说明
- CAM 子账号权限说明
- Vercel staging 环境变量清单
- 轻量服务器目录和 `.env` 初始化清单
- smoke test 联调 / 验收清单

## 2. 本轮已完成

已新增 2 份核心文档：

1. `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
2. `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

具体已覆盖内容：

### 2.1 手工配置 Runbook

已写清楚：

- COS 桶的固定命名、地域、访问权限
- COS CORS 的明确字段值
- CAM 子账号命名建议
- CAM 自定义策略 JSON
- Vercel staging 新增环境变量清单
- 轻量服务器只开放 SSH 的要求
- `/srv/jingjing-video-worker` 固定目录
- 服务器 `.env` 模板和必填变量
- `workers/video-worker` skeleton 如何复制到服务器
- 最终目录结构长什么样
- 必须从哪个目录执行 `docker compose up -d --build`

### 2.2 Smoke Checklist

已写清楚：

- 上传素材
- 创建视频任务
- Worker 认领
- COS 回传成片
- 前端预览
- 失败重试
- 重启恢复

每一步都写了：

- 操作动作
- 预期结果
- 去哪里看证据
- 什么情况下算通过

并且已经把“失败演练方式”从错误的 `OPENAI_API_KEY` 方案，改成和当前 C 线 skeleton 一致的：

- `instruction_text` 包含 `[force_fail]`

## 3. 本轮未完成

本轮刻意没有做这些事：

- 没有改任何 `app/**`
- 没有改任何 `workers/**`
- 没有改 migration
- 没有去腾讯云、Vercel、Supabase 控制台真实点配置
- 没有跑实际 smoke test

也就是说：

- 这次交付的是 `Runbook + Checklist`
- 不是“已经联调通过”的执行记录

## 4. 改动文件

本轮新增文件：

- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`
- `docs/handoff/2026-04-23-staging-cos-video-ops-docs-handoff.md`

本轮未改动任何代码目录。

## 5. 验证结果

本轮只做了文档级最小验证：

- 已确认 3 份前置上下文文档存在并已阅读：
  - `AGENTS.md`
  - `docs/架构规范/2026-04-23-当前阶段技术决策-媒体存储与视频执行架构.md`
  - `docs/handoff/2026-04-23-staging-cos-video-worker-implementation-task.md`
- 已确认本轮新增文件都落在允许修改的目录中：
  - `docs/progress/**`
  - `docs/test/**`
  - `docs/handoff/**`
- 已确认本轮没有触碰：
  - `app/**`
  - `workers/**`
  - `migrations`
  - `package.json`

未做的验证：

- 未执行真实 COS 配置
- 未执行真实 Vercel 配置
- 未执行真实服务器初始化
- 未执行真实 smoke test

## 6. 当前分支 / worktree / commit

- worktree：`/Users/wy/.codex/worktrees/b93e/小红书抖音矩阵获客平台`
- 当前分支：`feature/staging-cos-video-ops-docs`
- 当前基线 commit：`449d1ff24e51faa21584718278d49f803f181bab`
- 说明：本轮按“单个实现 commit”收口，最终提交 hash 会在创建后作为复审输出明确报告；同一个 Git 提交无法在提交内容里自包含自己的最终 hash

## 7. push / merge 状态

- 未 push
- 未 merge
- 未请求合并

## 8. 下一步建议

下一位真实执行的人，建议严格按下面顺序走：

1. 先照 `manual-setup` 文档完成 COS、CAM、Vercel、服务器手工配置
2. 再等 A / B / C 三条实现线代码落齐
3. 然后按 `smoke-checklist` 逐项联调
4. 把真实执行结果再补一份新的 `docs/progress/` 联调记录

如果后续 C 线把 Worker 实际环境变量名又补充了更多字段，以 C 线 handoff 为准，在服务器 `.env` 文档上增量补齐，不要反向覆盖这次已经冻结的基础值。
