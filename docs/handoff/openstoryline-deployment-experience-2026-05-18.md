# OpenStoryline 部署方案经验沉淀

日期：2026-05-18

## 1. 这次真正要解决的问题

这次部署不是单纯“把 OpenStoryline 跑起来”，而是把本地已经改过的 OpenStoryline 能力接入现有生产链路：

```text
video-worker
-> openstoryline-engine
-> firered-openstoryline
-> final.mp4
```

核心目标有四个：

1. 服务器不要继续使用旧版 OpenStoryline 功能。
2. 本地当前改动要能快速、安全地部署上去。
3. `video-worker` 和 `openstoryline-engine` 作为现有连接层暂时保留。
4. 模型、资源、结果产物不要反复打包、上传、覆盖。

所以最终方案不是“完整迁移一个 Web 应用”，而是“把 OpenStoryline 收敛成 headless 执行服务，让 worker/engine 继续负责外层编排”。

## 2. 最终推荐方案

采用：

```text
小代码包上传
+ 服务器本地 docker compose build
+ 服务器挂载已有 resource/.storyline/outputs
+ 固定 config.toml 随包上传
```

不采用：

```text
本地打 1GB+ Docker 镜像
+ 上传 COS
+ 服务器 curl 下载
+ docker load
```

推荐方案的原因：

- 上传体积小，失败重试成本低。
- 服务器已有资源和模型，不需要每次跟代码一起传。
- OpenStoryline 当前还在快速变动，代码包比镜像包更适合频繁迭代。
- `video-worker` 和 `engine` 已经在服务器稳定运行，没必要全量重启。
- 大 Docker 镜像上传 COS 会引入额外变量：上传速度、签名 URL 过期、断点续传、对象清理、镜像加载时间。

## 3. 服务边界

最终服务边界保持清晰：

```text
前端/业务系统
-> video-worker
-> openstoryline-engine
-> firered-openstoryline
```

各自职责：

- `video-worker`：任务接收、素材下载、结果上传、状态回写。
- `openstoryline-engine`：内部适配层，把 worker 请求转成 OpenStoryline 请求。
- `firered-openstoryline`：只负责根据本地素材、脚本、指令生成视频。

OpenStoryline 不再承担：

- 用户 Web 页面操作入口。
- 浏览器聊天入口。
- 浏览器素材上传流程。
- 业务任务状态管理。
- COS 上传和数据库回写。

OpenStoryline 应该承担：

- 读取本地素材路径。
- 读取锁定脚本和剪辑指令。
- 执行剪辑、配音、时间线、渲染。
- 输出 `final.mp4` 和元数据。

## 4. 为什么不优先走大 Docker 镜像

大镜像方案表面上“最完整”，但这次不是最稳：

```text
本地 build 镜像
-> docker save
-> zstd 压缩
-> 上传 COS
-> 生成签名 URL
-> 服务器下载
-> sha256 校验
-> docker load
-> docker tag
-> compose up
```

这个链路适合：

- 多台服务器分发。
- 版本已经冻结。
- 镜像仓库不可用但需要制品归档。
- 依赖安装极慢，服务器不能 build。

但这次不适合，因为：

- 本地功能还在改。
- 镜像体积曾达到 GB 级。
- 上传速度不可控，失败后重传成本高。
- COS CORS 对 CLI 上传和服务器下载没有帮助。
- 服务器已经有运行资源，不应该把结果产物和模型一起塞进镜像。

经验结论：

> 快速迭代阶段优先传代码包；版本冻结、多机分发阶段再沉淀镜像制品。

## 5. COS 和 CORS 的判断

COS CORS 只影响浏览器跨域访问，例如：

```text
http://localhost:3001
-> browser PUT/GET COS object
```

本次部署链路是：

```text
本机 CLI 上传
服务器 curl 下载
```

这两类请求不走浏览器 CORS 机制。

所以：

- 浏览器直传 COS 需要 CORS。
- `coscli cp` 不依赖 CORS。
- `curl signed-url` 不依赖 CORS。
- CORS 配对了也不能解决大包上传慢、签名过期、服务器下载中断这类问题。

经验结论：

> 先判断请求是谁发出的。浏览器才有 CORS；CLI 和服务器之间通常没有 CORS 问题。

## 6. config.toml 的处理

这次最终采用：

```text
固定 config.toml 随代码包上传到服务器
后续通过 SSH 修改服务器上的 config.toml
不提交 Git
不写进公开镜像
```

这样做的原因：

- 单模型配置已经收敛，不需要前端或 OpenStoryline 内再选模型。
- 部署时需要一个确定的配置基线。
- 服务器后续需要能热修 key、模型名、base_url、TTS 参数。
- `config.toml` 可能包含敏感信息，不应该进 GitHub。

注意：

- 可以上传到服务器，不等于可以提交到 Git。
- 可以放进私有部署包，不等于可以放进公开镜像。
- 文档和日志里不要打印 API key。

经验结论：

> 配置文件要区分三种位置：本地工作区、服务器运行目录、代码仓库。能上服务器，不代表能进仓库。

## 7. 服务器旧版本怎么处理

服务器当前旧 OpenStoryline 不作为生产基线保留。

处理方式：

1. 备份旧目录。
2. 清理旧上传残留。
3. 替换 `openstoryline/firered` 代码。
4. 保留 `/srv/jingjing-video-worker/firered` 下的运行资源。
5. 只重建并重启 `firered-openstoryline`。

必须保留：

```text
video-worker
openstoryline-engine
/srv/jingjing-video-worker/firered/resource
/srv/jingjing-video-worker/firered/.storyline
/srv/jingjing-video-worker/firered/outputs
```

可以清理：

```text
旧 openstoryline/firered 代码
tmp 里的无效 .part
tmp 里的旧 openstoryline tar/zst
旧的误打大包
```

经验结论：

> 清理服务器时先分清“代码目录”和“运行数据目录”。替换代码，不要误删资源和产物。

## 8. 打包边界

小代码包应该包含：

```text
agent_fastapi.py
src/
prompts/
scripts/
requirements.txt
run.sh
Dockerfile
.dockerignore
config.toml
```

小代码包不应该包含：

```text
outputs/
resource/
.storyline/models/
.storyline/.server_cache/
.venv/
.tmp_wheels/
dist/
.git/
*.log
*.tar
*.zst
*.part
```

正常包大小应该是 MB 级。如果变成几百 MB 或 GB 级，基本说明误打了资源、输出、虚拟环境或历史包。

经验结论：

> 打包后第一件事看体积。体积异常比任何命令输出都更早暴露边界错误。

## 9. Docker 的正确角色

Docker 在这次方案里的角色是“运行环境封装”，不是“所有资产的搬运箱”。

镜像内应该有：

- Python 运行环境。
- 系统依赖，例如 `ffmpeg`。
- OpenStoryline 代码。
- Python 依赖。

镜像外应该挂载：

- `config.toml`
- `outputs/`
- `resource/`
- `.storyline/`
- server cache

经验结论：

> 镜像放稳定运行环境，volume 放会变化的大资产和产物。

## 10. 验证顺序

部署后不要直接跑完整视频任务，先分层验证：

1. 容器是否起来：

```bash
docker compose ps
```

2. OpenStoryline 是否健康：

```bash
curl http://127.0.0.1:7860/health
```

3. Engine 是否能探测 OpenStoryline：

```bash
curl http://127.0.0.1:8000/ready
```

4. 挂载是否存在：

```bash
docker compose exec firered-openstoryline bash -lc "test -f /app/config.toml && ls -la /app/resource /app/.storyline /app/outputs"
```

5. 最后再跑全链路任务：

```text
video-worker 下载素材
-> engine 调 OpenStoryline
-> OpenStoryline 生成 final.mp4
-> worker 上传 COS
-> worker 回写状态
-> 前端预览成片
```

经验结论：

> 全链路失败时不要一上来猜模型问题。先验证容器、健康检查、engine、挂载、再验证任务。

## 11. 这次踩出来的关键坑

### 11.1 静态页面不是生产入口

OpenStoryline Web 能打开，不代表它已经能接入生产链路。

生产需要的是：

```text
/api/worker/runs
```

不是：

```text
浏览器聊天
WebSocket session
页面上传素材
```

### 11.2 API key 错误容易被误判成功能问题

`401 Unauthorized`、`403 Forbidden` 通常优先看：

- key 是否有效。
- base_url 是否对应供应商。
- model 是否被该 key 授权。
- 配置是否被环境变量覆盖。

不要先改业务逻辑。

### 11.3 大包重复上传会浪费大量时间

一旦发现已经上传成功，不要再次上传同一个大包。先确认：

- 对象是否存在。
- size 是否正确。
- sha256 是否一致。
- 服务器是否已经下载。

### 11.4 服务器上的旧代码不能当成本地真实状态

服务器旧 OpenStoryline 改过，但用户要的是“本地现在的功能”。所以部署基线必须明确：

```text
以本地当前工作区为准
服务器旧代码只备份，不合并
```

### 11.5 不要用全量 down 影响其他服务

只替换 OpenStoryline 时，应该执行：

```bash
docker compose build firered-openstoryline
docker compose up -d --no-deps firered-openstoryline
```

不要执行会影响 `video-worker` 的全量停机操作。

## 12. 后续标准化建议

后续可以把这次经验固化为三个文件：

```text
doc/plan/openstoryline-server-deploy-runbook.md
doc/plan/openstoryline-deployment-experience-2026-05-18.md
scripts/package-openstoryline-deploy.ps1
```

下一步可以自动化：

- 一键生成小代码包。
- 自动检查包体积。
- 自动列出包内文件。
- 自动阻止 `resource/`、`outputs/`、`.venv/` 入包。
- 自动生成 sha256。
- 自动输出服务器部署命令。

后续如果版本稳定，再考虑：

- 推私有镜像仓库。
- 或 COS 保存 Docker 镜像归档。
- 或拆分 base image 和 app image，减少重复构建。

## 13. 最终可复用判断框架

以后类似 AI 视频服务部署，可以先问五个问题：

1. 当前是快速迭代还是稳定发布？
2. 模型和资源是否已经在服务器存在？
3. 运行产物是否应该进入镜像？
4. 配置是公开配置、服务器私有配置，还是环境变量？
5. 要替换的是单个服务，还是整条链路？

对应决策：

- 快速迭代：传小代码包。
- 稳定多机分发：传镜像或推镜像仓库。
- 大模型/大资源：优先服务器挂载，不跟代码一起发。
- 输出产物：只放 volume，不进镜像。
- 敏感配置：不进 Git，不打印日志。
- 单服务替换：`up -d --no-deps service`，不要全量 down。

## 14. 本项目当前结论

本项目当前最稳方案是：

```text
本地当前 OpenStoryline
-> 打小代码包，包含固定 config.toml
-> 上传到 /srv/jingjing-video-worker/tmp
-> 备份并替换 /srv/jingjing-video-worker/openstoryline/firered
-> 复用 /srv/jingjing-video-worker/firered/resource 和 .storyline
-> docker compose build firered-openstoryline
-> docker compose up -d --no-deps firered-openstoryline
-> 分层验证 health/ready/全链路
```

这套方案的核心不是“省一步”，而是把代码、配置、模型、资源、输出、编排层拆开管理。拆清楚以后，部署速度、排错速度、回滚安全性都会更好。

