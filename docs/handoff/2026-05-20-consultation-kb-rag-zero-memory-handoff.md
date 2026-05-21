# 2026-05-20 咨询台知识库 / Agentic RAG 零上下文交接

## 0. 这份文档的用途

如果你是一个没有聊天上下文的新 Agent，请先读本文件。读完后应该能无缝接上当前工作：继续改咨询台知识库读取、营销日历写入、Dify 输入上下文、成员端内容生成链路，而不需要依赖上一段聊天记录。

当前项目根目录：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

当前业务目标：

- 用户在“用户知识库”上传的文本资料，咨询台 AI 能在需要时真实读取。
- AI 可以把用户知识库里的业务事实沉淀到策略资产 / 营销日历。
- 后续 Dify 图文/视频生成输入能拿到营销日历里的 `knowledgeRefs` 和指导信息。
- 不要把“澄清门禁”做成压过模型判断的硬编码。

## 1. 必读顺序

先读：

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/handoff/2026-05-19-domestic-infra-current-context-zero-memory-handoff.md`
4. `docs/progress/2026-05-20-consultation-kb-runtime-read-fix.md`
5. `docs/progress/2026-05-20-member-auth-invite.md`

再按任务需要读：

1. `docs/产品文档/V2.3-内容日历驱动图文视频生成PRD.md`
2. `docs/产品文档/V2.4-内容检索与媒体素材分层路由PRD.md`
3. `docs/架构规范/2026-05-15-选题到内容生成全链路产品总纲.md`
4. `docs/架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md`
5. `docs/架构规范/2026-05-06-consultation-agent-native-tool-loop-design.md`

关键代码入口：

```text
app/src/server/api/consultation-service.ts
app/src/server/api/consultation-runtime/runtime.ts
app/src/server/api/consultation-runtime/tools.ts
app/src/server/api/consultation-runtime/rag.ts
app/src/server/api/consultation-runtime/utils.ts
app/src/lib/content-calendar-guidance.ts
app/src/server/api/daily-content-task-service.ts
app/src/server/api/consultation-service.test.ts
```

## 2. 当前 Git / 远端 / 部署状态

当前本地分支：

```text
main
```

当前远端：

```text
gitee  git@gitee.com:jingjing_2025/jingjing-content-platform.git
origin git@github.com:svmlearn/jingjing-aigc-platfrom.git
```

当前 main 关键提交：

```text
3dd4e80 docs: record consultation kb read fix
a5e9c08 fix: route explicit knowledge reads to retrieval tool
5d3e7c2 fix: prompt consultation agents to retrieve requested knowledge
a186536 fix: return knowledge snippets to consultation tools
28ff4b4 fix: let consultation agent own kb and calendar choices
71b1cf1 Merge branch 'codex/domestic-infra-migration'
```

服务器当前已部署代码 release：

```text
/srv/jingjing-domestic/releases/20260520140700-a5e9c08
/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260520140700-a5e9c08
```

注意：`3dd4e80` 是文档记录提交，代码部署到 `a5e9c08` 即可，无需因为文档提交重新部署。

服务器：

```text
ubuntu@8.154.28.41
```

服务状态最后验证：

```text
jingjing-domestic-app.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
GET /api/health: ok=true
database.provider=postgres
storage.provider=aliyun_oss
```

不要把服务器密码、用户密码、AccessKey、cookie 写进文档或提交。

## 3. 最近完成的工作

### 3.1 成员端登录 / 邀请码注册

已完成并部署：

- 成员端有独立登录。
- 成员可用邀请码注册并加入团队。
- 成员可加入多个团队，首页可选择团队。
- 服务器迁移已应用。
- 进度见 `docs/progress/2026-05-20-member-auth-invite.md`。

用户测试账号已创建过：

```text
dongzhou@163.com
```

不要在文档里写这个账号的密码。用户知道密码，上一窗口已经给过。

### 3.2 咨询台用户知识库读取修复

用户反馈：在 `dongzhou@163.com` 下已上传知识库，但咨询台像读不到。

实际排查：

- 上传没问题。
- 商家有 3 份 indexed 知识文档。
- 共有 36 个非空知识 chunk。
- `retrieve_knowledge_base` 早期日志能命中 5 个片段。

根因：

1. native tool result 原来只把命中数量、文档 id、chunk id 等元数据给模型，没有把 chunk 正文给模型。
2. 移除 runtime 强制预检索后，模型在“你自己读一下知识库”这种明确话术下有时仍直接回答，不主动调用工具。
3. 原有 `request_user_clarification` 结构化结果会把问句转成一种“澄清门禁”，产品方向上不希望它压过模型判断。

已修复：

- 移除自动 `request_user_clarification` 阻断型结果。
- 移除模板式 `ensureTeamCalendarDraftForRequest` 后处理。
- `update_content_calendar` 改为接收模型传入的 `calendar` 条目。
- `retrieve_knowledge_base` 的 native tool result 增加知识正文片段。
- 对明确“读/看/总结/盘点知识库/上传资料”的用户消息，native loop 首轮把 tool choice 路由到 `retrieve_knowledge_base`。
- 工具返回后，模型如何回答、追问或写资产仍由模型判断。

验证：

- 本地 `typecheck / consultation-service.test / lint / build` 全过。
- 服务器 release 到 `a5e9c08`。
- 烟测账号 `dongzhou@163.com` 下临时 session 发送：

```text
你自己读一下知识库的东西，盘点一下咱们项目的优势
```

结果：

- tool card 出现 `retrieve_knowledge_base`
- 命中 5 个知识片段
- 回复开始引用上传资料中的信号，例如 `光明区`、`回报率`、`佣金切分`、`中介激活`
- 临时 smoke session 已删除

详细记录见：

```text
docs/progress/2026-05-20-consultation-kb-runtime-read-fix.md
```

## 4. 当前设计原则：不要把 RAG 做歪

用户刚提到想参考 `references/` 里的 Claude Code 泄漏源码。注意：

- 不要读取、复刻或基于泄漏源码实现。
- 可以使用公开、通用的 agentic retrieval 思路。
- 对代码仓库类 Agent，`grep/rg + read file` 是常见检索原语。
- 对本项目用户知识库，不应该直接 shell grep 文件；资料在 DB/OSS/knowledge_chunks 里。

本项目更合适的实现方向：

```text
用户明确读知识库
-> route to retrieve_knowledge_base
-> DB 里的 direct document/chunk read
-> keyword grep-like scan
-> vector semantic search
-> rerank / interleave
-> tool result 返回片段正文 + knowledgeRefs
-> 模型自行判断回答、追问、写策略资产或写营销日历
```

也就是说，我们要做的是“数据库版 grep-like 检索 + 向量检索”的 hybrid RAG，而不是直接 grep 本地文件夹。

## 5. 咨询台 / 营销日历 / Dify 当前链路

当前已有能力：

- `retrieve_knowledge_base` 能检索平台方法论和用户知识库。
- 明确读知识库时会路由到检索工具。
- `update_content_calendar` 现在可以接收模型生成的 `calendar` 条目。
- `buildMerchantKnowledgeCalendarGuidance` 会从咨询命中的 merchant knowledge 中构造 `knowledgeRefs`。
- `attachGuidanceToContentCalendar` 会把 guidance 挂到 calendar item。
- `daily-content-task-service.ts` 会收集 `calendarGuidance` 和 `calendarKnowledgeRefs`，进入后续 Dify / 内容生成输入。

关键文件：

```text
app/src/lib/content-calendar-guidance.ts
app/src/server/api/daily-content-task-service.ts
app/src/server/api/content-generation-service.ts
```

下一步重点不应该是再加硬 prompt，而是完善检索质量和写入时机：

1. `retrieve_knowledge_base` 做 hybrid retrieval：
   - explicit document scan
   - keyword search / grep-like scan
   - vector semantic search
   - 多文档交错返回，避免只返回同一文档连续片段
2. 工具结果保留足够正文，但注意 token 预算。
3. 营销日历写入时，让模型把“为什么用这些知识片段”沉淀到 `guidance` / `knowledgeRefs`。
4. Dify 输入侧继续消费 `calendarGuidance`，不要把知识库事实只停留在聊天回复里。

## 6. 当前不要做的事

- 不要提交 `docs/其他/`，它目前是本地未跟踪目录。
- 不要把泄漏源码作为参考资料读取或复刻。
- 不要把“命中知识库后必须先基于资料回答”做成硬规则。
- 不要恢复自动 `request_user_clarification` 的阻断型门禁。
- 不要写模板式默认房地产日历来伪装模型已生成。
- 不要因为文档提交重新部署服务器。
- 涉及真实发布、真实账号、素材生成时先确认目标商家、团队、账号和环境。

## 7. 推荐下一步

如果下一窗口继续做“知识库读取不够聪明 / RAG 质量不够好”，建议按这个顺序：

1. 读 `rag.ts`，确认 direct read、vector、keyword fallback 当前实现。
2. 为 `retrieveConsultationKnowledge` 增加更明确的 hybrid 召回结构。
3. 增加测试，覆盖：
   - 明确读知识库时必须返回正文给模型。
   - 多文档资料交错命中。
   - keyword grep-like 查询能命中没有 embedding 优势但含关键业务词的片段。
   - `knowledgeRefs` 能从咨询命中一路进入 daily content task / Dify 输入。
4. 本地跑：

```text
cd app
npm run typecheck
node --test src/server/api/consultation-service.test.ts
node --test src/lib/content-calendar-guidance.test.ts
npm run lint
npm run build
```

5. 如果代码变更影响服务器，再发 clean release 并验证：

```text
GET http://8.154.28.41/api/health
systemctl is-active jingjing-domestic-app.service
systemctl is-active jingjing-firered-openstoryline.service
systemctl is-active jingjing-openstoryline-engine.service
systemctl is-active jingjing-video-worker.service
```

## 8. 当前交接状态

本轮目标已完成：

- 用户知识库上传存在且可检索的事实已确认。
- 咨询台明确读知识库时的工具调用与正文回传已修复。
- 代码已推送到 Gitee main 和 GitHub main。
- 服务器已部署代码 commit `a5e9c08`。
- 文档记录 commit `3dd4e80` 已推送，未重新部署，符合 docs-only 处理。

本 handoff 是为换上下文窗口准备的补充交接文档。
