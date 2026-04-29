# FireRed-OpenStoryline

这是一个适合公开上传到 Gitee 的整理版说明。

当前仓库已经完成两件事：

- 已删除本机使用过的 API、API Key、Access Token、AppID 等敏感信息
- `config.toml` 已改成占位符写法，适合公开提交

同时保留了本地增强能力说明，包括：

- ByteDance Big TTS V3 provider：`bytedance_bigtts`
- DashScope AI 转场 provider
- 本地 MCP 与 Web 服务的启动方式

## 1. 项目简介

FireRed-OpenStoryline 是一个对话式视频剪辑项目，核心能力包括：

- 加载本地图片和视频素材
- 自动搜索补充媒体素材
- 镜头理解、筛选、分组和脚本生成
- 旁白生成、BGM 选择、字幕与时间线规划
- 渲染最终视频
- 通过 MCP 或 Web 界面完成多轮剪辑

## 2. 目录说明

建议重点关注这些目录和文件：

```text
FireRed-OpenStoryline/
├─ src/open_storyline/          核心逻辑
├─ web/                         Web 前端
├─ docs/                        项目文档
├─ resource/                    默认字体、BGM、脚本模板、TTS 参数
├─ scripts/                     配置和辅助脚本
├─ agent_fastapi.py             Web 服务入口
├─ cli.py                       命令行入口
├─ config.toml                  主配置文件（已改成占位符）
├─ requirements.txt             Python 依赖
└─ README.md                    当前整理后的说明
```

## 3. 环境准备

推荐环境：

- Python 3.11
- Conda 或 venv
- FFmpeg 已加入 PATH
- Windows PowerShell / macOS Terminal / Linux Shell

推荐安装方式：

```bash
conda create -n storyline python=3.11
conda activate storyline
pip install -r requirements.txt
```

如果你还没有下载模型和资源，请按原项目文档下载 `models.zip` 和 `resource.zip`，再解压到项目要求的位置。

## 4. 配置说明

当前仓库里的 `config.toml` 已经去掉敏感值。公开上传前，不要把真实密钥写回仓库。

至少要填写这些字段：

```toml
[llm]
model = "YOUR_LLM_MODEL"
base_url = "YOUR_LLM_BASE_URL"
api_key = "YOUR_LLM_API_KEY"

[vlm]
model = "YOUR_VLM_MODEL"
base_url = "YOUR_VLM_BASE_URL"
api_key = "YOUR_VLM_API_KEY"

[search_media]
pexels_api_key = "YOUR_PEXELS_API_KEY"
```

如果要启用 TTS，可以按 provider 选择一组填写：

```toml
[generate_voiceover.providers.bytedance]
uid = "YOUR_BYTEDANCE_UID"
appid = "YOUR_BYTEDANCE_APP_ID"
access_token = "YOUR_BYTEDANCE_ACCESS_TOKEN"

[generate_voiceover.providers.bytedance_bigtts]
label = "ByteDance Big Model"
base_url = "https://openspeech.bytedance.com"
uid = "YOUR_BIGTTS_UID"
appid = "YOUR_BIGTTS_APP_ID"
access_key = "YOUR_BIGTTS_ACCESS_KEY"
resource_id = "YOUR_BIGTTS_RESOURCE_ID"
speaker = "YOUR_BIGTTS_SPEAKER_ID"

[generate_voiceover.providers.minimax]
base_url = "YOUR_MINIMAX_BASE_URL"
api_key = "YOUR_MINIMAX_API_KEY"
```

如果要启用 AI 转场，可以填写：

```toml
[generate_ai_transition.providers.dashscope]
model_name = "wan2.2-kf2v-flash"
api_key = "YOUR_DASHSCOPE_API_KEY"

[generate_ai_transition.providers.minimax]
model_name = "MiniMax-Hailuo-02"
api_key = "YOUR_MINIMAX_AI_TRANSITION_API_KEY"
```

默认本地服务配置如下：

```toml
[local_mcp_server]
connect_host = "127.0.0.1"
port = 8001
path = "/mcp"
```

Web 服务默认运行在：

- `http://127.0.0.1:8005/`

## 5. 启动方式

### 5.1 启动 MCP

Windows PowerShell：

```powershell
$env:PYTHONPATH = "src"
python -m open_storyline.mcp.server
```

macOS / Linux：

```bash
PYTHONPATH=src python -m open_storyline.mcp.server
```

### 5.2 启动 Web

```bash
python -m uvicorn agent_fastapi:app --host 127.0.0.1 --port 8005
```

### 5.3 启动后验证

- MCP：
  - `http://127.0.0.1:8001/mcp`
  - 返回 `406` 也算正常在线
- Web：
  - `http://127.0.0.1:8005/`
  - 首页返回 `200`

## 6. 基本使用流程

### 6.1 Web 界面

1. 启动 MCP 和 Web
2. 打开 `http://127.0.0.1:8005/`
3. 上传本地图片或视频素材
4. 输入剪辑目标，例如：
   - “剪成 1 分钟横版介绍视频”
   - “保留高光镜头，生成旁白和字幕”
   - “做成小红书风格短视频”
5. 等待任务执行和视频输出

### 6.2 Agent / Skills

本仓库保留了两个可用 skill：

- `openstoryline-install`
- `openstoryline-use`

Codex 可安装方式：

```bash
npx skills add FireRedTeam/FireRed-OpenStoryline --skill openstoryline-install --agent codex
npx skills add FireRedTeam/FireRed-OpenStoryline --skill openstoryline-use --agent codex
```

## 7. 上传到 Gitee 前的检查清单

公开上传前，建议逐项确认：

- `config.toml` 中仍然是占位符，不是真实 Key
- 没有把 `.venv/`、`.logs/`、`.storyline/`、`outputs/`、`.downloads/`、`.tools/` 提交进去
- 没有把本地测试视频、渲染结果、缓存模型一起提交
- README 中展示的是占位符和通用命令，而不是真实账号信息

当前 `.gitignore` 已经按公开仓库场景整理过，会忽略：

- 虚拟环境
- 日志
- 本地缓存
- 输出视频
- 本地工具和下载目录

## 8. Gitee 上传示例

如果你要新建一个 Gitee 仓库并推送当前项目，可以参考：

```bash
git init
git add .
git commit -m "chore: prepare sanitized OpenStoryline project for public upload"
git branch -M main
git remote add origin https://gitee.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

如果当前目录已经是一个 Git 仓库，直接改远程地址或新建分支即可。

## 9. License

本项目继续沿用上游许可证，请保留原始 `LICENSE` 文件，并在公开仓库中说明来源。
