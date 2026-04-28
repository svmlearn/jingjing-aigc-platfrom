# 2026-04-27 视频工具全链路设计与当前实现交接

## 1. 当前目标

本轮目标是为视频工具全链路设计工作留下可接手的 handoff，方便下一位 Agent 或协作者继续补齐剩余专项设计。

当前全链路方向已经收敛为：

```text
增长 Agent 做内容决策
-> 主应用做脚本/素材确认和作业创建
-> video-worker 做视频执行
-> 主应用做预览审核和修订分流
```

工程板块分为两部分：

1. `app/`：主应用业务生产板块。
2. `workers/video-worker/`：视频执行工具板块。

两者之间的核心连接合同是：

```text
video_edit_jobs.input_payload
-> ProductionDirective
-> openstoryline-engine /v1/runs
```

## 2. 已完成内容

### 2.1 video-worker 执行侧合同

已完成最小 `ProductionDirective` 合同设计和实现。

当前 worker 会在下载素材和调用执行引擎前校验：

1. `script.text` 必须存在。
2. `script.locked` 显式为 false 时必须拒绝。
3. `desired_outputs` 必须包含 `final_video`。

合同类失败映射为 `failed_manual`，运行时或基础设施失败仍走 `failed_retryable`。

### 2.2 OpenStoryline skeleton

`workers/video-worker/openstoryline` 当前作为内部 `openstoryline-engine` 包装层使用。

已验证：

1. 本机 FastAPI app 调用 `/health` 和 `/v1/runs` 可跑通。
2. 本机 Uvicorn HTTP 调用可跑通。
3. Docker 镜像可构建。
4. Compose 单服务 `openstoryline-engine` 可启动并通过 smoke。
5. `/v1/runs` 可生成：
   - `final.mp4`
   - `cover.jpg`
   - `subtitles.srt`
   - `run-metadata.json`

### 2.3 Docker 运行时依赖

已发现并修复容器内缺少 `ffmpeg` 的问题。

修复位置：

```text
workers/video-worker/openstoryline/Dockerfile
```

### 2.4 engine adapter 边界

已新增 OpenStoryline engine adapter 边界。

当前 adapter：

| adapter | 状态 | 说明 |
| --- | --- | --- |
| `skeleton` | 已可运行 | 当前 staging 默认执行引擎 |
| `fire_red` | 已预留，fail closed | 未完成映射前返回 HTTP 501 |

环境变量：

```text
OPENSTORYLINE_ENGINE_ADAPTER=skeleton
FIRERED_OPENSTORYLINE_BASE_URL=
```

### 2.5 已完成的架构文档

已新增或更新以下正式设计文档：

1. `docs/架构规范/2026-04-25-video-worker-openstoryline-main-implementation-plan.md`
2. `docs/架构规范/2026-04-26-app-business-production-work-plan.md`
3. `docs/架构规范/2026-04-26-video-worker-execution-work-plan.md`

其中：

- 主实施方案定义总方向：`作业合同先行 + 现有 video-worker 承载 + OpenStoryline adapter 接入 FireRed`。
- 主应用业务生产板块文档定义 `app/` 负责用户、增长、素材、审核和作业创建。
- 视频执行工具板块文档定义 `workers/video-worker/` 负责 claim、校验、下载、执行、上传和回写。

## 3. 当前正在做什么

当前工作处于设计补齐阶段。

已经确认下一步要补齐五份专项设计文档：

1. 增长层 Agent 工作文档。
2. 素材层工作文档。
3. 视频作业 payload 合同文档。
4. 预览审核与修订工作文档。
5. FireRed adapter 接入设计文档。

这五份文档尚未写入仓库。

## 4. 下一步建议

建议下一轮直接补齐五份设计文档，文件名如下：

```text
docs/架构规范/2026-04-27-growth-agent-work-plan.md
docs/架构规范/2026-04-27-asset-layer-work-plan.md
docs/架构规范/2026-04-27-video-job-payload-contract.md
docs/架构规范/2026-04-27-preview-revision-work-plan.md
docs/架构规范/2026-04-27-firered-adapter-integration-plan.md
```

推荐顺序：

1. 先补增长层 Agent，因为它决定 `GrowthBrief -> VideoStrategy -> ScriptDrafts`。
2. 再补素材层，因为它决定 `AssetPlan -> AssetMatchReport -> ScriptBinding`。
3. 再补作业 payload 合同，因为它是 `app/` 到 `worker` 的唯一稳定连接点。
4. 再补预览审核和修订，因为它决定语义修订和制作修订如何回流。
5. 最后补 FireRed adapter，因为 FireRed 接入必须建立在上游合同稳定之后。

## 5. 改动文件

当前工作区已有未提交改动。

### 5.1 代码和 worker 相关改动

```text
workers/video-worker/.env.example
workers/video-worker/README.md
workers/video-worker/openstoryline/Dockerfile
workers/video-worker/openstoryline/app/config.py
workers/video-worker/openstoryline/app/main.py
workers/video-worker/openstoryline/app/schemas.py
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/worker/app/directive.py
workers/video-worker/worker/app/openstoryline_client.py
workers/video-worker/worker/app/processor.py
workers/video-worker/tests/
```

### 5.2 架构文档改动

```text
docs/架构规范/2026-04-25-video-worker-openstoryline-main-implementation-plan.md
docs/架构规范/2026-04-26-app-business-production-work-plan.md
docs/架构规范/2026-04-26-video-worker-execution-work-plan.md
```

### 5.3 本地 progress / handoff 记录

```text
docs/progress/2026-04-25-openstoryline-container-smoke.md
docs/progress/2026-04-25-video-worker-production-directive-progress.md
docs/handoff/2026-04-25-video-worker-openstoryline-handoff.md
docs/handoff/2026-04-27-video-tool-full-chain-design-handoff.md
```

注意：`docs/handoff/` 当前被 `.gitignore` 忽略，大部分 `docs/progress/` 记录也被忽略。这些本地记录不会自动进入 Git。

## 6. 当前分支 / worktree

当前分支：

```text
master
```

当前 worktree：

```text
D:\codexplan\work\jingjing-content-platform
```

本轮没有创建独立 worktree。

后续进入正式实现或多文件继续改动前，建议先冻结当前主工作区状态，方式可选：

1. commit 当前成果。
2. 或导出 patch。
3. 或明确说明下一轮不继承当前主目录脏改动。

## 7. commit / push / merge 状态

当前状态：

| 项目 | 状态 |
| --- | --- |
| commit | 未创建 |
| push | 未执行 |
| merge | 未执行 |
| PR | 未创建 |

不要默认 merge 或 push。按项目规则，当前结果应先交给用户验收和收口决策。

## 8. 验证结果

此前已完成的验证：

### 8.1 Python 单元测试

命令：

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

结果：

```text
8 tests passed
```

覆盖：

1. `ProductionDirective` 合同校验。
2. `openstoryline_client` 请求 payload。
3. `RunRequest` schema。
4. `skeleton` adapter 输出。
5. `fire_red` adapter fail closed。

### 8.2 Python 编译检查

命令：

```powershell
python -m py_compile workers\video-worker\worker\app\processor.py workers\video-worker\worker\app\directive.py workers\video-worker\worker\app\openstoryline_client.py workers\video-worker\openstoryline\app\config.py workers\video-worker\openstoryline\app\engine_adapters.py workers\video-worker\openstoryline\app\schemas.py workers\video-worker\openstoryline\app\main.py
```

结果：通过。

### 8.3 Docker / Compose 验证

已验证：

```powershell
docker compose -f workers\video-worker\docker-compose.yml build openstoryline-engine
```

Compose 单服务 smoke 结果：

```text
health_status ok
engine_adapter skeleton
engine openstoryline-skeleton
run_adapter skeleton
final_video_path /tmp/openstoryline-compose-adapter-smoke/outputs/final.mp4
compose_adapter_outputs_ok
```

### 8.4 diff 检查

此前 `git diff --check` 通过，仅出现 Windows CRLF 提示。

## 9. 风险和注意事项

1. `docs/handoff/` 被 `.gitignore` 忽略，本文件是本地交接记录，不会自动提交远端。
2. 当前主工作区已有多处未提交改动，后续不应在未冻结状态下随意开启大规模实现。
3. 外部 `D:\codex work\FireRed-OpenStoryline` 不能直接覆盖当前 `workers/video-worker/openstoryline`。
4. 外部 FireRed 本地配置曾发现真实 provider key，不能原样带入项目。
5. 当前 `fire_red` adapter 只是预留并 fail closed，不代表完整 FireRed 已接入。
6. 增长层 Agent 专项设计尚未落地；当前只有咨询 Agent runtime 底座。
7. 素材层、作业 payload、预览修订、FireRed adapter 仍需专项设计后再实现。
8. worker 不应承担增长策略、素材业务判断或审核职责。
9. 主应用不应直接调用 FireRed 或 OpenStoryline 内部接口，只应创建 `video_edit_jobs` 并读取结果。

## 10. 交接判断

当前可以安全接续的下一步是：

```text
补齐五份专项设计文档
```

不建议下一步直接写 FireRed adapter 实现，也不建议先改 worker 大逻辑。原因是上游增长、素材、作业合同和修订回流还未设计完整，直接接 FireRed 会把执行引擎复杂度提前压到不稳定的业务合同上。
