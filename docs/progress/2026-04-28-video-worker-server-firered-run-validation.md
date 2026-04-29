# 2026-04-28 video worker 服务器 FireRed 真实 run 验证

## 结论

服务器 `/srv/jingjing-video-worker` 已切到 FireRed/OpenStoryline Docker 三服务模式，并完成一次真实 `/v1/runs` 冒烟。

本次冒烟不是在本机跑引擎，而是在服务器 Docker 内部完成：

- `firered-openstoryline`：healthy
- `openstoryline-engine`：healthy，`engine_adapter=fire_red`
- `video-worker`：已启动并进入 Supabase 轮询

成功产物：

```text
/srv/jingjing-video-worker/outputs/smoke-20260428-130411/final.mp4
/srv/jingjing-video-worker/outputs/smoke-20260428-130411/firered-run-metadata.json
```

视频探测结果：

```json
{
  "width": 608,
  "height": 1080,
  "duration": "2.400000"
}
```

## 本次服务器改动

已更新服务器 `.env`，不在文档中记录任何密钥明文。

关键非敏感配置：

```text
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
FIRERED_OPENSTORYLINE_BASE_URL=http://firered-openstoryline:7860
OPENSTORYLINE_LLM_MODEL=glm-4-flash
OPENSTORYLINE_LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
OPENSTORYLINE_VLM_MODEL=glm-4.6v
OPENSTORYLINE_VLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
```

原因：

- 最新提供的 LLM/VLM key 可用于 BigModel。
- `glm-4.6v` 会返回 reasoning 内容，不适合作为当前 LangChain 工具循环里的主 LLM。
- `glm-4-flash` 通过了 OpenAI-compatible 调用验证，并成功跑通 FireRed worker run。
- VLM 暂保留 `glm-4.6v`，用于后续视觉理解能力验证。

## 资源预热

服务器首次拉取 FireRed `resource.zip` 很慢，已改为把本地已解包 runtime 资源上传到服务器挂载目录，避免容器启动长期卡在下载。

已补齐：

```text
/srv/jingjing-video-worker/firered/resource
/srv/jingjing-video-worker/firered/.storyline/skills
```

FireRed `/health` 返回确认：

```json
{
  "status": "ok",
  "provider_key_configured": true,
  "runtime_assets": {
    "transnet_weights": true,
    "bgms": true,
    "fonts": true,
    "outputs": true
  }
}
```

## 过程中发现并修正的问题

1. 服务器慢速下载 `resource.zip` 导致 `firered-openstoryline` 长时间 unhealthy。
   - 处理：上传本地已解包资源到服务器挂载目录。

2. FireRed runtime 缺少 `/app/.storyline/skills`。
   - 表现：`skillkit.core.exceptions.ConfigurationError`。
   - 处理：上传 `.storyline/skills` 到服务器挂载目录。

3. 早前 DeepSeek `deepseek-v4-pro` 虽可鉴权，但当前工具循环不兼容其 reasoning 内容回传要求。
   - 表现：`reasoning_content in the thinking mode must be passed back to the API`。
   - 处理：生产运行时改用 BigModel key，LLM 选 `glm-4-flash`。

## 已验证命令

```bash
cd /srv/jingjing-video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered ps
```

结果：

```text
firered-openstoryline Up healthy
openstoryline-engine Up healthy
video-worker Up
```

`openstoryline-engine /ready`：

```json
{
  "status": "ready",
  "service": "openstoryline-engine",
  "engine_adapter": "fire_red",
  "fire_red_base_url_configured": true,
  "fire_red_provider_key_configured": true
}
```

## 尚未完成的全链路项

这次验证跑通的是：

```text
server Docker -> openstoryline-engine /v1/runs -> firered-openstoryline -> final.mp4
```

还没有完成真实业务全链路：

```text
app 视频工作台 -> Supabase video_edit_jobs -> video-worker 轮询 -> COS 下载素材 -> FireRed 出片 -> COS 上传 -> result_payload 回写
```

剩余风险：

- 真实带配音任务仍需要补齐 TTS provider 凭证；本次冒烟显式禁用了 voiceover/BGM。
- 真实素材链路还需要用 app 上传到 COS 后创建 job 验证。
- 真实转场能力已配置 key，但本次冒烟没有启用 AI transition。

下一步建议直接用 app 创建一个带 COS 素材、`voiceover.enabled=false` 的最小视频任务，验证 worker 轮询、COS 上传和数据库回写。
