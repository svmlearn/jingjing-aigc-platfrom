# 2026-04-25 Video Worker OpenStoryline 交接

## 当前目标

验证 `workers/video-worker/openstoryline` 是否能作为当前 video worker 的内部
`openstoryline-engine` 跑通；如果不能，再考虑是否用
`D:\codex work\FireRed-OpenStoryline` 替代。

## 当前结论

不建议直接替换。当前项目内的 OpenStoryline 骨架在修复 Docker 运行时依赖后已经跑通。

外部 FireRed 项目应作为后续适配来源，不应直接覆盖当前目录：

1. 外部 FireRed 没有当前 worker 依赖的 `/v1/runs` HTTP 契约。
2. 外部 FireRed 本地 `config.toml` 含真实 provider key，不能原样搬入仓库。
3. 当前 worker 已围绕内部 `openstoryline-engine` 契约工作，直接覆盖会破坏接口边界。

## 已完成

1. 验证本机 Python 直接调用 `app.main:app`。
2. 验证本机 Uvicorn HTTP 调用 `/health` 和 `/v1/runs`。
3. 复现 Docker 容器内 `/v1/runs` 失败。
4. 定位根因为容器内缺少 `ffmpeg`。
5. 修改 `workers/video-worker/openstoryline/Dockerfile`，安装 `ffmpeg`。
6. 重新构建镜像并验证容器内能生成：
   - `final.mp4`
   - `cover.jpg`
   - `subtitles.srt`
   - `run-metadata.json`
7. 使用正式 `docker compose` 服务定义验证 `openstoryline-engine` 单服务可启动、健康检查可过、`/v1/runs` 可产出文件。
8. 更新 progress 记录。
9. 新增 OpenStoryline engine adapter 边界：
   - `skeleton` 为默认可运行 adapter。
   - `fire_red` 为后续完整 FireRed 接入预留 adapter，目前 fail closed，避免误用。
   - `/health` 暴露当前 adapter。

## 改动文件

与本次 OpenStoryline 验证直接相关：

- `workers/video-worker/.env.example`
- `workers/video-worker/openstoryline/Dockerfile`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `docs/progress/2026-04-25-openstoryline-container-smoke.md`

本工作区还保留了上一阶段 production directive 合同相关改动：

- `workers/video-worker/README.md`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/openstoryline/app/schemas.py`
- `workers/video-worker/worker/app/openstoryline_client.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/directive.py`
- `workers/video-worker/tests/`
- `docs/progress/2026-04-25-video-worker-production-directive-progress.md`

## 验证结果

已通过：

```powershell
docker compose -f workers\video-worker\docker-compose.yml build openstoryline-engine
```

Compose 单服务 smoke：

```text
health_status ok
engine_adapter skeleton
engine openstoryline-skeleton
run_adapter skeleton
final_video_path /tmp/openstoryline-compose-adapter-smoke/outputs/final.mp4
compose_adapter_outputs_ok
```

Python 单测：

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

结果：8 tests passed。

静态编译：

```powershell
python -m py_compile workers\video-worker\worker\app\processor.py workers\video-worker\worker\app\directive.py workers\video-worker\worker\app\openstoryline_client.py workers\video-worker\openstoryline\app\schemas.py workers\video-worker\openstoryline\app\main.py
```

结果：通过。

`git diff --check`：通过，仅有 CRLF 提示。

## 当前分支和合并状态

- 分支：`master`
- worktree：主工作区 `D:\codexplan\work\jingjing-content-platform`
- commit：未创建
- push：未执行
- merge：未执行

## 下一步建议

1. 若当前目标只是让 worker staging 骨架可跑通，可以进入验收。
2. 若目标是接入完整 FireRed，应新开一阶段做适配层，而不是目录覆盖。
3. 完整 FireRed 接入建议先定义：
   - 当前 `/v1/runs` 入参到 FireRed session/chat/tool 的映射
   - 输出文件和 metadata 的稳定回填规则
   - provider key 的环境变量化和脱敏配置
   - 容器镜像大小、模型资源下载、冷启动时间的验收线
