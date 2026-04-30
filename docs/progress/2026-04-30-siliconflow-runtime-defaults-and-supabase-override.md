# SiliconFlow Runtime 默认值与 Supabase 旧配置兜底记录

日期：2026-04-30

分支：`codex/v2.1-article-prompt-templates`

## 背景

在本地图文工作台联调时，页面一直提示：

```text
AI 生成服务暂不可用，已先生成一版可编辑草稿。
```

最初排查发现新 worktree 缺少 `app/.env.local`，补齐后仍然 fallback。

继续定位后确认：本地环境里有 `SILICONFLOW_API_KEY`，但平台 LLM runtime 默认值仍是 OpenAI：

```text
baseUrl = https://api.openai.com/v1
primaryModel = gpt-4.1
```

这会导致服务端用硅基流动的 key 去请求 OpenAI-compatible 默认地址，最终 LLM 调用失败，图文工作台按设计降级为模板草稿。

## 为什么这件事要记录

当前本地 worktree 可能读不到 Supabase 中已经修好的平台设置，或 Supabase `platform_settings.llm_runtime` 里仍残留旧的 OpenAI 默认值。

后续如果部署到云端，运行时会读取：

1. 环境变量中的 key，例如 `SILICONFLOW_API_KEY`。
2. Supabase `platform_settings` 中的 `llm_runtime`。
3. 代码默认 runtime，作为无设置时的 fallback。

如果第 2 项仍是旧 OpenAI 地址，而第 1 项使用的是 `SILICONFLOW_API_KEY`，就会再次出现“有 key 但还是 fallback”的问题。

## 本轮代码决策

在 `app/src/lib/db/platform-admin-repository.ts` 中做两层兜底：

### 1. 默认 LLM runtime 改为 SiliconFlow

默认值改为：

```text
providerLabel = SiliconFlow
baseUrl = https://api.siliconflow.cn/v1
primaryModel = Qwen/Qwen3-32B
fallbackModel = Qwen/Qwen3-14B
timeoutSeconds = 60
```

依据：`docs/progress/2026-04-24-staging-real-ai-runtime-progress.md` 中已记录 staging 真实 AI runtime 使用同一组硅基流动配置。

### 2. 当 key 来源是 SiliconFlow 且 Supabase 旧存 OpenAI 默认地址时，自动归一到 SiliconFlow

新增判断逻辑：

```text
apiKeySource === "siliconflow"
and storedBaseUrl is empty or https://api.openai.com/v1
=> use SiliconFlow default baseUrl/model
```

这样即使 Supabase `platform_settings.llm_runtime` 仍旧存 OpenAI 默认地址，只要当前服务实际使用的是 `SILICONFLOW_API_KEY`，运行时也会自动使用硅基流动的 baseUrl/model。

## 对云端的影响

这次改动会影响云端，但影响是预期的保护性兜底：

- 如果云端 Supabase 已经正确配置为 SiliconFlow：不改变行为。
- 如果云端 Supabase 仍旧存 OpenAI 默认地址，但环境变量使用 `SILICONFLOW_API_KEY`：自动改用 SiliconFlow，避免误打 OpenAI。
- 如果未来确实要改回 OpenAI，需要同时更换环境变量为 `OPENAI_API_KEY`，并在平台后台保存 OpenAI baseUrl/model。
- 如果使用其他 OpenAI-compatible provider，建议使用 `LLM_API_KEY` 并显式保存对应 `baseUrl/model`，避免被 SiliconFlow 兜底逻辑接管。

## 排查方式

如果后续再次出现图文工作台 fallback：

1. 先看 `content_drafts.input_snapshot.llmTrace.mode`：
   - `fallback_no_key`：服务端没有读到任何 AI key。
   - `fallback_error`：上游 runtime 请求失败。
   - `fallback_parse_error`：模型返回内容不是可解析 JSON。
2. 看服务端日志：

```text
[article-generation] llm fallback
```

日志会输出：

- `provider`
- `baseUrl`
- `model`
- `error`

不会输出密钥。

3. 如果日志里仍看到 `baseUrl=https://api.openai.com/v1` 且 key 来源是 SiliconFlow，优先检查本次兜底代码是否被部署。
4. 如果日志里是 `https://api.siliconflow.cn/v1`，则继续排查模型名、余额、限流、网络或 JSON 返回格式。

## 相关文件

- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/ai-runtime.ts`
- `app/src/server/api/content-generation-service.ts`
- `docs/progress/2026-04-24-staging-real-ai-runtime-progress.md`
