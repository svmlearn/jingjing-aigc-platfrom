# AGENTS.md

本文件给进入 `小红书抖音矩阵获客平台` 工作区的 AI Agent 提供统一协作约定。

目标不是追求“自动化很炫”，而是降低上下文丢失、并行改动互相覆盖、以及最终交付对产品经理不友好的问题。

## 1. 先理解这个工作区

这是一个从 0 到 1 逐步展开的项目目录，当前已经从早期方案探索进入“国内自托管主线 + PostgreSQL / Aliyun OSS + V2.x 协作开发”的阶段。

当前已知核心文件：

- `AGENTS.md`：协作约定
- `docs/README.md`：文档入口和推荐阅读顺序
- `docs/架构规范/2026-04-28-current-architecture.md`：当前系统架构总说明，覆盖咨询台、脚本制作 agent、app、worker、FireRed/OpenStoryline、COS、预览修订
- `docs/progress/2026-05-20-main-domestic-infra-merge.md`：国内化主线合入事实和验证记录
- `docs/progress/2026-05-21-voice-fix-main-release.md`：服务器 release 后 health check，当前运行口径为 PostgreSQL / Aliyun OSS
- `app/`：当前 Next.js 商家端、平台管理端、API routes、PostgreSQL schema/migrations 的主应用
- `.codex/agents/`：项目级 Codex sub-agent 定义
- `.codex/skills/`：项目级 Codex skills

当前目录分层：

- `docs/handoff/`：交接文档、冻结说明、任务书
- `docs/progress/`：执行日志、验证记录、阶段结论
- `docs/探索/`：方案探索、竞品拆解、外部项目研究
- `docs/协作/`：Agent 协作说明、流程规划、给协作者读的沟通约定
- `docs/产品文档/`：PRD、信息架构、页面清单、业务规则
- `docs/架构规范/`：接口约束、状态机、发布链路规则、Prompt 规范
- `docs/designs/`：历史 UI 原型和视觉参考，不是当前实现入口
- `references/`：本地外部参考项目副本，已在 `.gitignore` 中忽略，不提交远端
- `app/`：主应用，包含商家端、平台管理端、API、PostgreSQL schema/migrations

如果实际目录和这里不完全一致，以项目当前真实落地目录为准，但协作分层思路尽量保持一致。

## 2. 本项目默认工作方式

这不是“边聊边堆功能点”的项目。

更稳的方式是：

1. 先读上下文文档
2. 再确认当前任务边界
3. 规划类优先输出方案、结构、页面与流程
4. 实现类改完后补 handoff / progress
5. 默认先冻结成果，不直接把探索性结果并进主线

## 3. 启动顺序

进入项目后，优先按这个顺序获取上下文：

1. 先读本文件 `AGENTS.md`
2. 读 `docs/README.md`
3. 如果任务涉及产品判断，按 `docs/README.md` 指向读取当前产品真相源，不默认沿用历史 PRD
4. 如果任务涉及 AI 视频、图文数据落点、worker、FireRed/OpenStoryline、PostgreSQL、Aliyun OSS 或部署，读 `docs/架构规范/2026-04-28-current-architecture.md`、`docs/progress/2026-05-20-main-domestic-infra-merge.md`、`docs/progress/2026-05-21-voice-fix-main-release.md`
5. 如果任务是接续某个未完成事项，再读相关 `docs/handoff/` 和 `docs/progress/`

旧 `docs/探索/`、旧 `docs/handoff/`、旧 `docs/progress/` 只作为历史资料，不再作为默认真相源。只有当用户明确要求追溯历史、参考旧方案或排查历史部署时再读。

旧 Supabase Cloud / Vercel / COS / staging 文档默认是历史口径。当前主线以 `docs/README.md` 中的国内自托管、PostgreSQL、Aliyun OSS 说明为准。

如果某些目录还没建立，跳过即可，不要因为文档里写了就假设它已经存在。

## 4. 真相源怎么分

不同类型的信息放在不同地方，不要混写。

### 4.1 `docs/handoff/`

这里放：

- 零上下文交接
- 当前任务书
- 协作协议
- 某个分支 / 工作树的冻结说明

### 4.2 `docs/progress/`

这里放：

- 执行日志
- 接口联调留痕
- 发布链路验证结果
- 阶段性共识
- 真正跑通和没跑通的事实

### 4.3 `docs/探索/`

这里放：

- 新功能探索
- 方案对比
- 外部仓库 / 方法拆解
- 页面草图、流程草图
- 还没进入正式实现的想法

### 4.4 `docs/产品文档/`

这里放：

- PRD
- 信息架构
- 页面清单
- 角色权限规则
- 商家、门店、账号相关业务规则

当前产品真相源以 `docs/README.md` 的索引为准。旧 PRD 和早期导入/改写设想只作历史资料，除非任务明确要求追溯，否则不要默认采用。

### 4.5 `docs/架构规范/`

这里放：

- 平台适配层 contract
- 发布任务状态机
- 内容数据结构
- Prompt 规范
- AI 工作流约束

当前阶段最重要的架构规范是 `docs/架构规范/2026-04-28-current-architecture.md`。旧的分阶段工作计划、增长 Agent 文档、过渡性 FireRed 接入方案不再作为当前真相源。

### 4.6 `docs/协作/`

这里放：

- 给产品 / 开发 / 各自 AI 看的协作说明
- 技术变更的非工程化解释
- 需要对方确认的问题清单

如果某个能力已经形成稳定规则，不要长期只放在 `docs/探索/`。

探索稿先放 `docs/探索/`，一旦形成稳定共识，再搬到 `docs/架构规范/` 或 `docs/产品文档/`。

### 4.7 代码目录

代码事实以仓库本身为准，不要让文档替代代码。

文档负责帮助接手，不负责“伪造实现状态”。

## 5. Worktree 规则

这个项目后面很可能会进入“内容工作台 / API / 发布 Worker”并行推进阶段。

结论是：

1. `worktree` 对并行开发有效
2. 但对产品探索期项目来说，最后收口不能太重
3. 所以更适合“隔离开发 + 冻结交付 + 指定收口”，而不是所有人都自己复杂合并到底

### 5.1 什么时候开 worktree

满足以下任一条件，就优先开 worktree：

1. 改动不止一个文件
2. 会持续超过一轮会话
3. 主目录已有脏改动
4. 需要和另一位 Agent / 另一条任务并行
5. 涉及平台适配、发布链路、任务调度等中大型实现

### 5.2 什么时候不要直接在主目录改

不要直接在主目录里做中大型改动，尤其是：

1. 交互探索
2. 发布链路实验
3. 会多轮迭代的任务
4. 有可能被放弃的分支尝试

小规模文档修订、明确范围内的单文件改动，可以直接在当前目录完成。

### 5.3 本项目推荐的交付默认值

除非用户明确要求“现在就合并”，否则默认：

1. 在独立 worktree 完成改动
2. 跑最小验证
3. 产出最终 commit
4. 记录 patch 路径（如有）
5. 写 handoff
6. 状态记为“待验收 / 待合并决策”

不要默认帮用户把探索性分支合回主线。

### 5.4 合并策略

本项目默认不鼓励“谁开发谁自己复杂合并到底”。

更适合的方式是：

1. 开发者 worktree 负责把改动做干净
2. 集成人只在一个干净的集成工作区收口
3. 用户确认后再合并

如果必须整合多个分支，优先：

1. `fast-forward`
2. `cherry-pick`
3. 小范围明确 merge

尽量避免把用户拖进大冲突手工处理。

## 6. 多 Agent + Worktree 协作模式

本项目后续默认采用：

> 主 Agent + worktree 物理隔离 + implementer 编码实现 + code-reviewer 两阶段审查

这不是替代 worktree，而是把过去“用户手动复制提示词给另一个 Agent，再复制结果回来”的流程自动化。

### 6.1 项目级 Codex Sub-Agent

项目级 sub-agent 定义放在：

- `.codex/agents/implementer.toml`
- `.codex/agents/code-reviewer.toml`

角色分工：

1. `implementer`：在指定 worktree / branch 内完成编码实现、编译验证和自检。
2. `code-reviewer`：对 implementer 的 worktree 改动做两阶段审查，不直接修复代码。

后续可再扩展：

1. `feedback-observer`：记录用户对 AI 行为和流程的修正。
2. `evolution-runner`：扫描 feedback，提出 AGENTS / skills / 模板优化建议。

第一版先不启用后二者作为自动流程。

### 6.2 Implementer 派发规则

满足以下任一条件，优先派发 `implementer`：

1. 中大型代码实现。
2. 已有明确 PRD、handoff、任务书或文件边界。
3. 需要在独立 worktree 中完成。
4. 主线程不适合继续塞入实现细节。
5. 任务可以明确授权修改哪些文件或模块。

主 Agent 给 implementer 的任务书至少包含：

1. 任务目标。
2. worktree 路径。
3. branch / base。
4. 必读文档。
5. 可改文件范围。
6. 禁止触碰范围。
7. 是否启用 `long-task-gate`。
8. 验证命令。
9. handoff/progress 要求。
10. commit / push / merge 策略。

### 6.3 Long-Task 判定

长任务不是 implementer 自己随意声明的状态。

主 Agent 在派发前必须显式判断：

1. 如果启用长任务，任务书写明 `Long-task-gate: enabled`，并提供 task id、completion promise、source docs 和硬校验方向。
2. 如果不启用长任务，任务书写明 `Long-task-gate: disabled`。
3. implementer 可以复核判断；如果认为判断错误，应返回 `NEEDS_CONTEXT` 或提出异议，不应擅自扩大流程。
4. `long-task-gate` 的完成只能由 `.codex/skills/long-task-gate/scripts/check.py` 和独立 verifier 写入，不能由 Agent 口头宣布。

### 6.4 Code Reviewer 触发规则

以下情况优先派发或切换到 `code-reviewer`：

1. implementer 已完成 worktree 改动。
2. 准备进入合并前判断。
3. 用户要求 review。
4. 改动涉及主链路、状态机、数据结构、账号、发布、worker、数据库、存储或部署。
5. 长任务 gate 已有报告，或者任务明确不启用 gate。

审查分两阶段：

1. Spec Compliance：是否按任务书、PRD、架构、handoff/progress 做对。
2. Code Quality：是否有 bug、回归、缺测试、契约破坏、假成功或安全问题。

如果 Stage 1 有阻塞问题，先停在 Stage 1，生成返工指令，不用继续展开代码质量细枝末节。

### 6.5 Feedback 与 Memory

本项目暂不新增独立 memory 系统。

项目记忆由这些文件承担：

1. `docs/handoff/`：任务交接和冻结状态。
2. `docs/progress/`：执行事实和验证证据。
3. `docs/产品文档/`：稳定产品真相。
4. `docs/架构规范/`：稳定架构真相。
5. `AGENTS.md`：Agent 协作规则。
6. `.codex/skills/`：可复用执行能力。

feedback 是另一类东西，只记录“AI 行为和流程应该如何改进”的信号。

第一版 feedback 不依赖 hook 自动写入。只有用户明确修正 Agent 行为、流程、验证方式或 sub-agent 派发方式，并且该信号可复用时，才考虑用 `feedback-writer` 写入 `.codex/feedback/`。

`evolution-engine` 只能提出建议，任何 AGENTS / skill / hook 改动都必须先给用户逐条确认。

## 7. 已验证过的经验

这些不是理论，而是这类项目协作里最容易踩坑的地方。

### 7.1 先冻结基线，再开工

如果主仓有未提交改动，直接新开 worktree 可能拿不到这些改动。

所以开工前必须至少满足一个条件：

1. 当前基线已 commit
2. 或已经导出 patch
3. 或明确说明“本轮不继承主目录脏改动”

### 7.2 文件独占比“口头说不冲突”更靠谱

并行阶段要先划文件边界。

谁改哪些文件，要在任务书或日志里写明，不要靠记忆。

### 7.3 `docs/` 不是 worktree 自动隔离区

`docs/` 的协作靠纪律，不靠 Git 自动保护。

如果多人会改同一份文档：

1. 先在日志里写 `lock`
2. 写完后补 `unlock`

### 7.4 默认先“不 push / 不 merge”

这个项目前期会有很多探索型任务，先冻结结果、待验收，再决定要不要进主线，通常更适合用户。

### 7.5 部署不一定从带 `.git` 的目录做

如果部署平台、账号权限或 Git author 限制卡住了，不要死磕一种方式。

可考虑：

1. 用干净快照目录部署
2. 明确目标环境，不要误发到错误项目
3. 先做测试环境验证，再做正式环境动作

## 8. Handoff 规则

本项目已经默认采用：`handoff` 比依赖聊天记录更可靠。

### 8.1 什么情况下必须写 handoff

以下情况结束前必须留 handoff：

1. 当前任务没做完
2. 已做完但暂不合并
3. 下一位 Agent 需要接手
4. 结果需要用户验收后再决定

### 8.2 handoff 最少包含什么

至少写清楚：

1. 当前目标
2. 已完成内容
3. 正在做什么
4. 下一步建议
5. 改动文件
6. 对应 branch / worktree
7. 最终 commit
8. 验证结果
9. 是否 `push / merge`

### 8.3 handoff 放哪

默认放在：

- `docs/handoff/`

文件名建议：

- `YYYY-MM-DD-<task>-handoff.md`
- `YYYY-MM-DD-<topic>-zero-memory-handoff.md`

## 9. Progress 规则

如果这轮工作是“执行了什么、修了什么、验证了什么”，优先写到：

- `docs/progress/`

尤其是：

1. 数据结构调整记录
2. 接口联调记录
3. 发布验证结果
4. 回滚点
5. 关键命令与输出结论
6. 账号授权与失效情况

### 9.1 Progress 的可恢复性标准

`docs/progress/` 不是只写“这次跑通了”的流水账，而是要让未来接手者在问题复发、表现变形或线上突然异常时，能复原当时的判断、边界和回滚路径。

写 progress 时要预防这种情况：

> 本轮修改当下验证通过，但未来某天暴露了一个当时没覆盖到的隐性问题。接手者应能通过这份 progress 判断：原来这次改动解决的是哪一层问题、没有解决哪一层问题、当时有哪些半成功状态或风险假设，以及现在应该从哪里排查或恢复。

因此，重要任务的 progress 不能只写最终结论，还应尽量写清楚：

1. **问题原貌**：用户看到的现象、错误信息、影响账号 / 商家 / 环境、触发时间和触发入口。
2. **根因判断**：为什么认为是这个原因；哪些证据支持，哪些只是推断；如果有被排除的假设，也要简短写明。
3. **前后状态**：修复前是什么状态，修复后正确状态是什么；涉及数量、状态机、表、对象存储前缀、服务版本时要写具体值。
4. **实际改动**：改了哪些代码、数据、配置、权限、服务器 release、RAM / OSS / DB 状态；不要只写“已修复”。
5. **验证证据**：跑过哪些命令、接口、SQL、健康检查；写关键输出结论，而不是只写“测试通过”。
6. **半成功与中断点**：如果过程中有第一次失败、补跑、部分写入、跳过步骤、临时绕路，必须记录。未来很多问题都出在这种“当时补上了但没人知道”的缝隙里。
7. **隐性风险和未覆盖范围**：当时没有做什么、哪些问题只是暂时绕过、哪些能力还没实现、哪些验证没跑或跑不了。
8. **恢复路径**：如何回滚代码、如何恢复数据、如何重新验证、哪些东西不要轻易删除；真实账号 / 生产数据 / OSS 对象尤其要写恢复顺序。
9. **未来排查入口**：给后续 Agent 或研发一个最短路径，例如先查哪张表、哪个 release、哪个 policy、哪个日志、哪个脚本。

如果 progress 涉及生产数据、账号授权、OSS / DB 迁移、发布链路、worker、素材库、视频生成或真实商家账号，默认按这个可恢复性标准写。宁可多写关键事实，也不要让后续只能从聊天记录里猜。

## 10. 任务默认模板

如果要开始一个正式实现任务，建议先明确这几项：

1. 任务目标
2. 涉及目录
3. 不要碰的文件
4. 是否需要 worktree
5. 是否需要 sub-agent：
   - 不需要
   - `implementer`
   - `code-reviewer`
   - `implementer + code-reviewer`
6. 是否是长任务，是否启用 `long-task-gate`
7. 验证命令和验收口径
8. 是否需要写 handoff / progress
9. 交付形式：
   - 只出探索文档
   - 代码 + handoff
   - 代码 + 验证 + 待合并
   - 直接合并

如果用户没说清，默认按：

`代码 + 验证 + handoff + 不直接合并`

如果任务满足 worktree 和 sub-agent 条件，默认按：

`worktree + implementer + 验证 + code-reviewer + handoff/progress + 待合并决策`

## 11. 对 Agent 的行为要求

进入本项目工作时：

1. 不要假设“采集、改写、视频生成、发布”已经形成完整闭环
2. 不要把产品设想写成仿佛已经实现的状态
3. 不要在未确认范围时大面积改动
4. 不要忽略已有 handoff / progress
5. 不要把一次性聊天结论当长期真相源
6. 要优先给用户提供“可接手、可验收、可回退”的结果
7. 涉及真实账号和真实发布时，默认更保守

一句话说：

在 `小红书抖音矩阵获客平台`，Agent 的价值不是“多写一点代码”，而是**把探索、实现、交接、收口都做得让产品经理和后续执行者接得住**。
