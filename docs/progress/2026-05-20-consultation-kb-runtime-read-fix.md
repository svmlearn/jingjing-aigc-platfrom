# 2026-05-20 咨询台用户知识库读取修复记录

## 背景

用户账号 `dongzhou@163.com` 已上传并索引商家知识库资料，但在咨询台说“你自己读一下知识库的东西”后，AI 回复仍偏向通用追问，表现为像没读到知识库。

## 排查结论

- 数据库中该商家已有 3 份 indexed 知识文档、36 个非空 chunk。
- 早期事件日志显示 `retrieve_knowledge_base` 可命中 5 个片段。
- 真正问题分两层：
  - native tool result 只把命中数量、文档 id 等元数据回传给模型，没有把 chunk 正文给模型。
  - 去掉 runtime 强制预检索后，仅靠 prompt 时，模型会把明确的“读知识库”误判为普通咨询。

## 修复内容

提交：

- `28ff4b4 fix: let consultation agent own kb and calendar choices`
- `a186536 fix: return knowledge snippets to consultation tools`
- `5d3e7c2 fix: prompt consultation agents to retrieve requested knowledge`
- `a5e9c08 fix: route explicit knowledge reads to retrieval tool`

关键调整：

- 移除自动 `request_user_clarification` 阻断型澄清结果，不再把最终回复里的问句硬转成 `blocksAssetWrite`。
- 移除模板式 `ensureTeamCalendarDraftForRequest` 后处理，`update_content_calendar` 改为可接收模型写入的 calendar 条目。
- `retrieve_knowledge_base` 的 native tool result 增加知识片段正文，供模型真实阅读。
- 对“读/看/总结/盘点知识库或上传资料”的明确请求，在 native agent loop 首轮将 tool choice 路由到 `retrieve_knowledge_base`；工具返回后，回答、追问或写资产仍由模型判断。

## 验证

本地：

- `npm run typecheck`
- `node --test src/server/api/consultation-service.test.ts`
- `npm run lint`
- `npm run build`

服务器：

- Release：`/srv/jingjing-domestic/releases/20260520140700-a5e9c08`
- `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260520140700-a5e9c08`
- `GET /api/health`: `ok=true`
- 服务状态：
  - `jingjing-domestic-app.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active

账号烟测：

- 登录 `dongzhou@163.com`。
- 创建临时咨询 session，发送：`你自己读一下知识库的东西，盘点一下咱们项目的优势`。
- 结果：
  - tool card 出现 `retrieve_knowledge_base`
  - 命中 5 个知识片段
  - 回复开始引用上传资料中的业务信号，例如 `光明区`、`回报率`、`佣金切分`、`中介激活`
  - 临时 smoke session 已删除

## 注意事项

- 本轮没有改数据库 schema。
- `docs/其他/` 仍是本地未跟踪目录，未 stage、未提交、未推送。
- 14:07 之后 app 日志未出现新的应用错误。13:51 左右的外键错误来自一次烟测时过早删除 queued session，后续已改为等待后台处理完成再删除。
