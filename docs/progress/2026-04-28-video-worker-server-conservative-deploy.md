# 2026-04-28 video worker 服务器保守推送记录

## 结论

已将本地 `workers/video-worker/` 快照推送到项目服务器 `/srv/jingjing-video-worker`。

本次采用保守部署策略：更新 worker 代码、Compose 和 OpenStoryline adapter 相关文件，但服务器继续使用 `OPENSTORYLINE_ENGINE_ADAPTER=skeleton`，不在本轮直接启用 FireRed 三服务真实引擎链路。

原因是当前服务器 `.env` 尚未补齐 FireRed 所需的 provider key、LLM/VLM/TTS provider secrets 和 FireRed runtime 资源。本轮目标是先保证现有 worker 服务稳定更新，不把生产路径误切到未准备好的 FireRed。

## 服务器信息

- 服务器：`43.160.208.189`
- SSH 用户：`mdeploy`
- 项目目录：`/srv/jingjing-video-worker`
- Compose 服务：
  - `openstoryline-engine`
  - `video-worker`

## 本地预检

已通过：

```powershell
$env:PYTHONPATH=(Resolve-Path 'workers\video-worker').Path
python -m pytest workers\video-worker\tests\test_openstoryline_engine_adapters.py workers\video-worker\tests\test_engine_run_contract.py
```

结果：

```text
12 passed
```

已通过：

```powershell
docker compose -f workers\video-worker\docker-compose.yml -f workers\video-worker\docker-compose.firered.yml --profile firered config --quiet
```

`git diff --check` 仅有 CRLF/LF 提示，无 whitespace error。

## 推送方式

本地打包时排除了：

- `.env`
- `tmp/`
- `outputs/`
- `models/`
- Python cache
- FireRed 本地 runtime artifacts

服务器保留：

- `/srv/jingjing-video-worker/.env`
- `/srv/jingjing-video-worker/tmp`
- `/srv/jingjing-video-worker/models`
- `/srv/jingjing-video-worker/outputs`
- FireRed runtime 目录，如后续创建

本轮首次同步未使用 `--delete`，避免误删服务器已有辅助脚本或历史文件。

## 备份点

源码目录备份：

```text
/tmp/jjw-worker-backup-20260428-191605.tgz
```

`.env` 备份：

```text
/srv/jingjing-video-worker/.env.backup-20260428-191910
```

FireRed 骨架变量补齐前的 `.env` 备份：

```text
/srv/jingjing-video-worker/.env.backup-firered-skeleton-20260428-193237
```

## 运行模式

当前服务器 `.env` 保持：

```text
OPENSTORYLINE_ENGINE_ADAPTER=skeleton
```

`.env` 权限保持：

```text
.env ubuntu:jingjing-deploy 640
```

同步后的代码文件已归到协作组：

```text
docker-compose.yml mdeploy:jingjing-deploy 664
docker-compose.firered.yml mdeploy:jingjing-deploy 664
README.md mdeploy:jingjing-deploy 664
```

## 重建与验证

已执行：

```bash
cd /srv/jingjing-video-worker
docker compose config --quiet
docker compose up -d --build openstoryline-engine video-worker
docker compose ps
```

验证结果：

```text
openstoryline-engine Up healthy
video-worker Up
restart_count=0
```

`openstoryline-engine` ready 检查：

```json
{"status":"ready","service":"openstoryline-engine","engine_adapter":"skeleton"}
```

`video-worker` 日志显示：

```text
OpenStoryline healthcheck ... engine_adapter: skeleton
Starting poll loop with interval=10s concurrency=1
```

## FireRed 预备状态

同日继续做了 FireRed 真实引擎链路的安全预备，但未切换运行模式。

已完成：

- 创建 FireRed 挂载目录：
  - `/srv/jingjing-video-worker/firered/.storyline`
  - `/srv/jingjing-video-worker/firered/resource/bgms`
  - `/srv/jingjing-video-worker/firered/resource/tts`
  - `/srv/jingjing-video-worker/firered/outputs`
- 目录权限设置为 `mdeploy:jingjing-deploy 2775`。
- `docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet` 通过。
- 已构建 `firered-openstoryline` 镜像：
  - image：`jingjing-video-worker-firered-openstoryline:latest`
  - size：约 `4.05GB`
- 容器级 import/health smoke 通过：

```text
service=firered-openstoryline
status=ok
provider_key_configured=false
runtime_assets.transnet_weights=false
runtime_assets.bgms=false
runtime_assets.fonts=false
```

已在服务器 `.env` 补齐 FireRed 非敏感骨架变量，敏感 key 保持空值。

当前不能切换到 `fire_red` 的阻塞：

```text
FIRERED_PROVIDER_KEY=EMPTY
OPENSTORYLINE_LLM_API_KEY=EMPTY
OPENSTORYLINE_VLM_API_KEY=EMPTY
TTS_BYTEDANCE_BIGTTS_APPID=EMPTY
TTS_BYTEDANCE_BIGTTS_ACCESS_KEY=EMPTY
TTS_BYTEDANCE_BIGTTS_RESOURCE_ID=EMPTY
TTS_BYTEDANCE_BIGTTS_SPEAKER=EMPTY
firered/.storyline/models/transnetv2-pytorch-weights.pth=MISSING
firered/resource/fonts=MISSING
```

当前线上服务状态保持正常：

```text
openstoryline-engine Up healthy
video-worker Up
openstoryline-engine /ready => engine_adapter=skeleton
restart_count=0
```

## 下一步建议

下一步如要启用真实 FireRed/OpenStoryline 出片链路：

1. 补齐 `.env` 中 FireRed provider key、LLM/VLM API key、TTS provider key。
2. 准备或允许下载 FireRed runtime assets，重点是 `.storyline/models/transnetv2-pytorch-weights.pth`、`resource/bgms`、`resource/fonts`。
3. 先单独启动 `firered-openstoryline` 验证 `/health`。
4. 再切换 `OPENSTORYLINE_ENGINE_ADAPTER=fire_red`，并用 override 启动三服务。
5. 提交一条真实短视频任务，验证 `final.mp4 -> COS -> video_edit_jobs.result_payload`。

## 20:08 二次上传 Docker/worker 改动

用户说明 Docker 侧又有改动后，继续将本地 `workers/video-worker/` 快照上传到服务器。

本地预检：

```powershell
$env:PYTHONPATH=(Resolve-Path 'workers\video-worker').Path
python -m pytest workers\video-worker\tests
```

结果：

```text
46 passed
```

已通过：

```powershell
docker compose -f workers\video-worker\docker-compose.yml -f workers\video-worker\docker-compose.firered.yml --profile firered config --quiet
git diff --check -- workers/video-worker
```

服务器同步：

- 上传包：`/tmp/jingjing-video-worker-20260428-200848.tgz`
- 源码备份：`/tmp/jjw-worker-backup-20260428-200848.tgz`
- 继续保留 `.env`、`.env.backup-*`、`tmp/`、`models/`、`outputs/`、FireRed runtime 资源目录。

服务器重建：

```bash
cd /srv/jingjing-video-worker
docker compose config --quiet
docker compose up -d --build openstoryline-engine video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered build firered-openstoryline
```

刷新日志：

```text
/tmp/jjw-docker-refresh-20260428-201003.log
```

刷新结果：

```text
openstoryline-engine Up healthy
video-worker Up
restart_count=0
openstoryline-engine /ready => engine_adapter=skeleton
```

新运行镜像：

```text
openstoryline-engine image=sha256:348151f7818beaaf611929e9b13e18c46a806f75bff3b2ca00fd55996d03487e
video-worker image=sha256:4e0ae4be056728a97a48a6cfb2818ec7d5d8502ae864af268c9ee7e56fd4a1c2
firered-openstoryline image rebuilt, not started
```

当前仍保持安全运行模式：

```text
OPENSTORYLINE_ENGINE_ADAPTER=skeleton
```
