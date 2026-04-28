# 2026-04-28 OpenStoryline productionConfig P1 映射收口

## 结论

本轮已补齐 `productionConfig -> worker production_config -> FireRed service_config` 的主链路合同映射。

现在可以说：

- Docker-first 生产运行面仍然是主路径：`video-worker -> openstoryline-engine -> firered-openstoryline`。
- 平台创建视频 job 时会写入默认或用户传入的 `productionConfig`。
- worker 会标准化并校验 voiceover、BGM、subtitles、render 配置。
- `openstoryline-engine` 会把 `production_config` 传给 FireRed worker API，并根据 TTS provider 环境变量生成 `service_config.tts`。
- FireRed prompt 已显式要求按配置调用 `generate_voiceover`、`select_bgm`，并以 `render_video` 作为最终节点。

仍不能说：

- 真实服务器已经完成带音轨的出片验收。

原因是 live smoke 还需要服务器真实补齐 Supabase、COS、LLM/VLM/TTS provider secrets、BGM 资源目录后执行一次真实 `/v1/runs -> final.mp4 -> COS` 验证。

## 涉及文件

- `app/src/contracts/video.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-job-payload.test.ts`
- `workers/video-worker/worker/app/directive.py`
- `workers/video-worker/worker/app/openstoryline_client.py`
- `workers/video-worker/openstoryline/app/schemas.py`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/tests/test_directive_contract.py`
- `workers/video-worker/tests/test_openstoryline_contract_payload.py`
- `workers/video-worker/tests/test_engine_run_contract.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

## 已验证

```text
cd app
node --test src/server/api/video-job-payload.test.ts
10 passed

cd app
corepack pnpm typecheck
exit 0

cd app
corepack pnpm lint
exit 0

cd workers/video-worker
python -m pytest tests -q
46 passed

cd workers/video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet
exit 0

git diff --check -- <changed files>
exit 0
```

## 下一步

服务器补齐真实 `.env` 后，跑一次真实 FireRed Docker smoke，并用 `ffprobe` 验证 `final.mp4` 包含 audio stream。
