# 2026-04-23 staging COS + Video Worker 手工配置 Runbook

## 目标

把当前已经冻结的 staging 四层架构，整理成一份可以直接照着点、照着填的手工配置说明：

```text
Vercel：前端 + 轻 API
Supabase：数据库、任务表、业务数据
腾讯云 COS：素材和成片存储
腾讯云轻量服务器：视频处理 Worker
```

这份文档只覆盖 `staging / PoC`，不覆盖 production。

## 当前固定值

以下值已经在架构文档和任务书里冻结，本轮不要自己改名：

| 项目 | 固定值 |
| --- | --- |
| Vercel 项目名 | `jingjing-content-platform-staging` |
| Supabase 项目名 | `jingjing-content-platform-staging` |
| Supabase Project Ref | `jrveaabguddromjtibbs` |
| Supabase URL | `https://jrveaabguddromjtibbs.supabase.co` |
| COS 逻辑桶名 | `jingjing-content-staging` |
| COS 已创建真实桶名 | `jj-content-staging-1341668543` |
| COS 地域 | `新加坡` |
| COS 地域简称 | `ap-singapore` |
| COS 访问级别 | `私有读写` |
| Worker 根目录 | `/srv/jingjing-video-worker` |
| Compose 项目根目录 | `/srv/jingjing-video-worker` |
| Worker 轮询间隔 | `10` 秒 |
| Worker 最大并发 | `1` |
| 任务超时回收阈值 | `120` 分钟 |
| STS 临时密钥有效期 | `1800` 秒 |
| 预览签名 URL 有效期 | `3600` 秒 |
| 上传文件上限 | `1073741824` 字节（1GB） |

## 0. 开始前先准备

在你真正开始点控制台之前，先把下面这些信息准备出来，避免一边点一边找：

| 名称 | 需要什么 | 去哪里拿 |
| --- | --- | --- |
| 腾讯云账号 | 主账号可登录 COS 和 CAM | 腾讯云控制台 |
| APPID | 你的腾讯云 APPID | 右上角头像 -> 账号信息 |
| 轻量服务器公网 IP | 后面 SSH 要用 | 腾讯云轻量服务器控制台 |
| Supabase Service Role Key | 现有 staging 已在 Vercel 使用 | Vercel / 本地安全记录 |
| OpenAI API Key | Worker 执行时要用 | 现有安全记录 |
| Vercel 项目权限 | 能改 `jingjing-content-platform-staging` 的环境变量 | Vercel 控制台 |

如果某一步看起来和界面小字不完全一样，以控制台里最接近的中文名称为准，不要自己改架构里的核心值。

2026-04-24 补充：

- 当前 staging 桶已经真实创建完成，不需要重新建桶
- 后续真实配置一律以 `jj-content-staging-1341668543` 为准
- `jingjing-content-staging` 只保留为早期方案里的逻辑命名，不再作为控制台实际输入值

这里有一个很容易弄混的地方：

- `APPID` 是一串数字，用在 COS 完整桶名和策略资源里
- 它不是 `UIN`

## 1. 腾讯云 COS 手工配置

### 1.1 创建 staging 私有桶

控制台路径：

`腾讯云控制台 -> 对象存储 COS -> 存储桶列表 -> 创建存储桶`

按下面这组值创建，不要临时发挥：

| 字段 | 填写值 |
| --- | --- |
| 所属地域 | `新加坡` |
| 存储桶名称输入框 | `jj-content-staging` |
| 实际桶名 | `jj-content-staging-1341668543` |
| 访问权限 | `私有读写` |
| 存储类型 | `标准存储` |
| 版本控制 | `关闭` |
| 默认 CDN / 全球加速 | `不要开` |
| 生命周期规则 | `先不配` |
| 默认加密 | 保持默认即可 |

创建后立刻到桶概览页，把下面三项抄到你的操作记录里：

| 项目 | 你实际看到的值 |
| --- | --- |
| APPID | `<待填写>` |
| 完整桶名 | `jj-content-staging-1341668543` |
| 地域简称 | `ap-singapore` |

### 1.2 不要开这些选项

这轮是 PoC，下面这些都先不要开，避免把简单链路搞复杂：

- 不要开 `公有读`
- 不要开 `默认 CDN 加速`
- 不要开 `全球加速`
- 不要开 `生命周期自动删除`
- 不要单独再配一套 `COS 桶策略` 给匿名访问

一句话记住：

`前端上传靠 STS 临时密钥，前端预览靠短时签名 URL，不靠公有读。`

### 1.3 配置 CORS

控制台路径：

`COS -> 存储桶列表 -> jj-content-staging-1341668543 -> 安全管理 / 跨域访问 CORS`

新增 1 条规则。如果控制台一次只允许填 1 个来源，就拆成 3 条同字段规则，只改来源这一列。

#### 方案 A：控制台支持一条规则写多个来源

| 字段 | 填写值 |
| --- | --- |
| 规则 ID | `staging-web-upload-read` |
| 来源 Origin | `http://localhost:3000`、`https://jingjing-content-platform-staging.vercel.app`、`https://*.vercel.app` |
| 方法 Method | `GET`、`HEAD`、`PUT`、`POST` |
| Allowed Headers | `*` |
| Expose Headers | `ETag`、`Content-Length` |
| Max Age | `600` |
| Response Vary | `开启 / true` |

#### 方案 B：控制台一次只能填 1 个来源

那就连续建 3 条规则，只有 Origin 不一样，其他字段完全照抄：

1. `http://localhost:3000`
2. `https://jingjing-content-platform-staging.vercel.app`
3. `https://*.vercel.app`

如果你的腾讯云界面里没有下面这些字段，也不要卡住：

- 没有 `规则 ID`：直接留空或按默认保存
- 没有 `Response Vary`：忽略这一项，其他字段照填

#### 这条 CORS 规则是干什么的

- `PUT` / `POST`：让浏览器能直传素材到 COS
- `GET` / `HEAD`：让浏览器能直接预览签名后的图片、视频、封面
- `Allowed Headers = *`：避免后面因为预检请求漏 header 卡住上传
- `Expose Headers = ETag`：前端上传完成后能拿到 `ETag` 并回写业务记录

### 1.4 固定对象 Key 规则

这一步不是在 COS 控制台里点的，而是后续 Vercel 和 worker 必须遵守的命名规则。这里先冻结，方便验收时比对：

```text
source-assets/{merchantId}/{sourceItemId}/{uuid}-{filename}
draft-inputs/{merchantId}/{draftId}/{uuid}-{filename}
video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4
video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg
video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt
```

验收时，如果对象没有落到这些前缀下，视为实现跑偏。

## 2. 腾讯云 CAM 子账号与权限

### 2.1 子账号用途

这轮建议新建 1 个专用 CAM 子账号，专门给 staging 的 Vercel 和 Worker 用。

建议命名：

- 子账号用户名：`staging-cos-video-worker`
- 自定义策略名：`jingjing-content-staging-media-rw`

不要直接拿主账号的永久密钥塞进 Vercel 或服务器。

### 2.2 新建子账号

控制台路径：

`腾讯云控制台 -> 访问管理 CAM -> 用户 / 子用户 -> 新建用户`

建议选择：

| 字段 | 建议值 |
| --- | --- |
| 用户名 | `staging-cos-video-worker` |
| 访问方式 | 勾 `编程访问` |
| 控制台访问 | 不勾 |
| 标签 | 可留空 |

创建完成后，腾讯云会展示一次 `SecretId` 和 `SecretKey`。这两个值只会完整显示一次，立刻复制到你的密码管理工具，不要只截图。

### 2.3 给子账号绑定自定义策略

控制台路径：

`CAM -> 策略 -> 新建自定义策略 -> 按策略语法创建 -> 空白模板`

策略内容直接用下面这个，把 `<APPID>` 换成你自己的真实值：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "name/cos:GetBucketLocation",
        "name/cos:HeadBucket",
        "name/cos:GetObject",
        "name/cos:HeadObject",
        "name/cos:PutObject",
        "name/cos:PostObject",
        "name/cos:DeleteObject",
        "name/cos:InitiateMultipartUpload",
        "name/cos:ListMultipartUploads",
        "name/cos:ListParts",
        "name/cos:UploadPart",
        "name/cos:CompleteMultipartUpload",
        "name/cos:AbortMultipartUpload"
      ],
      "resource": [
        "qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543",
        "qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543/*"
      ]
    }
  ]
}
```

保存后，把这条策略关联到刚才创建的 `staging-cos-video-worker` 子账号。

注意：

- 这里替换的是 `APPID`
- 不是 `UIN`

### 2.4 这条策略为什么这样配

- 它只放行 `jj-content-staging-1341668543` 这个桶
- 它允许对象上传、下载、删除和分块上传
- 它没有放 `cos:*`
- 它没有把权限放到整个账号的全部桶

这就是本轮的最小可用权限边界。

### 2.5 前端 STS 临时密钥的额外约束

这一步不是现在手工点出来的，而是后面 Vercel 发临时密钥时必须遵守的安全原则：

- 只给上传动作
- 只给单个 `cosKey`
- 不给 `GetObject`
- 不给 `DeleteObject`
- 不给 `cos:*`

一句话理解：

`CAM 子账号` 是后端长期身份，权限可以稍微宽一点，但仍然只限这个桶。  
`STS 临时密钥` 是发给浏览器的，必须再缩一次，只准写当前这一个对象路径。

## 3. Vercel staging 环境变量清单

### 3.1 操作入口

控制台路径：

`Vercel -> 项目 jingjing-content-platform-staging -> Settings -> Environment Variables`

这一轮环境变量全部配置在这个 staging 项目里，并且每一项都要同时勾上：

- `Production`
- `Preview`

原因：

- 这个项目本身就是 staging 项目
- 正式 staging 别名会走 `Production`
- worktree / 分支联调部署会走 `Preview`

变量改完以后，记得重新部署。Vercel 官方文档说明：环境变量变更不会自动作用到旧部署上，必须新部署后才生效。

### 3.2 保留现有变量，不要改名

这些变量已经在项目里存在，继续保留，不要擅自改名：

| 变量名 | 是否已存在 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | 现有 staging Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | 前端匿名 key |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | 服务端写库 |
| `OPENAI_API_KEY` | 是或待补 | 视频链路会继续用 |
| `APIFY_TOKEN` | 是或待补 | 现有项目保留 |
| `ADMIN_SETUP_SECRET` | 是 | 现有管理入口保留 |

### 3.3 本轮新增变量

下面这些是本轮一定要新增的：

| 变量名 | 示例值 | 备注 |
| --- | --- | --- |
| `COS_SECRET_ID` | `<CAM 子账号 SecretId>` | 服务端变量，不要加 `NEXT_PUBLIC_` |
| `COS_SECRET_KEY` | `<CAM 子账号 SecretKey>` | 服务端变量，不要加 `NEXT_PUBLIC_` |
| `COS_BUCKET` | `jj-content-staging-1341668543` | 用真实完整桶名 |
| `COS_REGION` | `ap-singapore` | 用地域简称 |
| `COS_STS_DURATION_SECONDS` | `1800` | 固定值 |
| `COS_READ_URL_TTL_SECONDS` | `3600` | 固定值 |
| `MEDIA_UPLOAD_MAX_BYTES` | `1073741824` | 1GB |

### 3.4 不要新增的错误变量

这轮不要自己发明这些变量：

- 不要建 `NEXT_PUBLIC_COS_SECRET_ID`
- 不要建 `NEXT_PUBLIC_COS_SECRET_KEY`
- 不要建 `COS_PUBLIC_BUCKET_URL`
- 不要建 `SUPABASE_STORAGE_BUCKET`

因为本轮不是 `Supabase Storage` 主存储，也不是公有桶方案。

## 4. 轻量服务器初始化清单

### 4.1 服务器安全组 / 防火墙

控制台路径：

`腾讯云轻量服务器 -> 实例 -> 防火墙`

当前阶段只保留：

| 协议 | 端口 | 来源 |
| --- | --- | --- |
| TCP | `22` | 你自己的出口 IP 优先；实在不方便时临时 `0.0.0.0/0`，做完再收紧 |

不要主动开放：

- `8000`
- `8001`
- `3000`
- `8080`

`OpenStoryline Web UI` 只允许通过 SSH 隧道临时访问，不直接暴露公网。

### 4.2 首次 SSH 登录

在本机终端执行：

```bash
ssh root@<你的服务器公网IP>
```

如果你不是 `root` 登录，把下面命令里的 `root` 替换成你实际用户，并在需要时加 `sudo`。

### 4.3 安装 Docker 与 Compose Plugin

如果机器是全新 Ubuntu 24.04，可以先执行：

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version
docker compose version
```

如果最后两条命令都能正常输出版本号，就表示 Docker 已经装好。

### 4.4 创建固定目录

直接执行：

```bash
mkdir -p /srv/jingjing-video-worker/tmp
mkdir -p /srv/jingjing-video-worker/models
mkdir -p /srv/jingjing-video-worker/outputs
chmod -R 755 /srv/jingjing-video-worker
```

做完后，用下面命令确认：

```bash
ls -al /srv/jingjing-video-worker
```

你应该至少能看到：

- `tmp`
- `models`
- `outputs`

### 4.5 把 `workers/video-worker` skeleton 放到服务器

这一步是当前 runbook 里最容易漏掉的关键动作。

前面我们只是在服务器上准备了目录和 Docker，本步骤才是真正把 C 线的 `video-worker` 运行文件放到服务器。

#### 4.5.1 先确认你本地拿的是哪一份代码

当前 D 线文档默认对齐的 worker skeleton 来源是：

- 分支：`feature/staging-cos-video-worker`
- 当前实现 commit：`052c57c6afad8c475f76579b0eedec23370615c4`

你本地只要有一个 checkout / worktree 能看到下面这个目录，就可以：

```text
workers/video-worker/
```

如果你本地当前目录里没有 `workers/video-worker/`，不要自己手搓 compose 文件，先切到 C 线对应的本地 checkout 再继续。

#### 4.5.2 推荐的复制方式

在你本地那份包含 `workers/video-worker/` 的仓库根目录执行：

```bash
scp -r workers/video-worker/. root@<你的服务器公网IP>:/srv/jingjing-video-worker/
```

这条命令的含义是：

- 把 `workers/video-worker/` 目录里的所有文件
- 包括隐藏文件 `.env.example`
- 一起复制到服务器的 `/srv/jingjing-video-worker/`

如果你后面不是第一次上传，而是要覆盖更新，推荐改用：

```bash
rsync -av --delete workers/video-worker/ root@<你的服务器公网IP>:/srv/jingjing-video-worker/
```

原因：

- `scp -r` 适合第一次最直接地拷过去
- `rsync -av --delete` 更适合后续同步更新，能删掉服务器上已经过时的旧文件

#### 4.5.3 复制完成后的最终目录结构

复制完成后，服务器上的 `/srv/jingjing-video-worker/` 应该长成这样：

```text
/srv/jingjing-video-worker/
├── .env.example
├── docker-compose.yml
├── README.md
├── openstoryline/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
├── worker/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
├── tmp/
├── models/
└── outputs/
```

这里的意思是：

- `docker-compose.yml` 就放在 `/srv/jingjing-video-worker/` 根目录
- `.env` 也要放在这个根目录
- `openstoryline/` 和 `worker/` 目录必须和 `docker-compose.yml` 同级

#### 4.5.4 复制完成后立刻检查

SSH 登录服务器后执行：

```bash
cd /srv/jingjing-video-worker
ls -al
find openstoryline worker -maxdepth 2 -type f | sort
```

如果你看不到：

- `docker-compose.yml`
- `.env.example`
- `openstoryline/`
- `worker/`

那就先不要继续联调，说明代码还没有真正落到服务器。

### 4.6 创建 Worker `.env`

在服务器上创建：

`/srv/jingjing-video-worker/.env`

建议先用：

```bash
nano /srv/jingjing-video-worker/.env
```

把下面内容贴进去，再把尖括号占位符换成真实值：

```dotenv
SUPABASE_DB_URL=<从 Supabase 控制台复制的 Postgres 连接串>
COS_SECRET_ID=<CAM_SECRET_ID>
COS_SECRET_KEY=<CAM_SECRET_KEY>
COS_BUCKET=jj-content-staging-1341668543
COS_REGION=ap-singapore
WORKER_POLL_INTERVAL_SECONDS=10
WORKER_MAX_CONCURRENCY=1
VIDEO_JOB_STALE_MINUTES=120
OPENAI_API_KEY=<OPENAI_API_KEY>
```

补充说明：

- `SUPABASE_DB_URL` 不要手打，直接去：
  - `Supabase -> Project Settings -> Database -> Connection string`
  - 复制 staging 项目的真实连接串再贴进来
- 如果这台轻量服务器后面遇到 IPv4 / 连接方式限制，以 Supabase 控制台里当前可用的 `Direct connection` 或 `Session pooler` 为准，不要在文档里自己拼 host
- 如果 C 线后续实现又新增了 `OpenStoryline` 或模型 provider 变量，以 `workers/video-worker` 分支 handoff 为准继续往这个 `.env` 里补
- 不要把 `.env` 文件提交回 Git

保存后再执行：

```bash
chmod 600 /srv/jingjing-video-worker/.env
```

### 4.7 从哪里启动 Compose

这一步也要写死，避免后面有人在错误目录执行：

- 正确的 Compose 项目根目录：`/srv/jingjing-video-worker`
- 正确的命令执行目录：`cd /srv/jingjing-video-worker`

先做一次配置解析检查：

```bash
cd /srv/jingjing-video-worker
docker compose config
```

如果这条命令报错，先不要启动服务，优先检查：

- `.env` 是否存在
- `docker-compose.yml` 是否存在
- `openstoryline/` 和 `worker/` 目录是否存在

确认没问题后，再正式启动：

```bash
cd /srv/jingjing-video-worker
docker compose up -d --build
```

启动后再执行：

```bash
cd /srv/jingjing-video-worker
docker compose ps
```

你应该至少看到两个服务：

- `openstoryline-engine`
- `video-worker`

### 4.8 服务器侧暂时不要做的事

- 不要在服务器上直接手工上传素材做长期存储
- 不要把成片留在 `/srv/jingjing-video-worker/outputs` 当主存储
- 不要把 COS 的密钥写进仓库代码
- 不要把 OpenStoryline 端口直接映射到公网

## 5. 联调前的最终核对清单

真正开始联调之前，按这个顺序勾一遍：

- COS 桶已创建，完整桶名已记录
- COS 桶权限是 `私有读写`
- COS CORS 已保存
- CAM 子账号已创建
- CAM 自定义策略已关联
- 已拿到 `SecretId / SecretKey`
- Vercel staging 项目已补齐 `COS_*` 变量
- Vercel 已重新部署
- 轻量服务器只开放 `22`
- 服务器已装 `Docker` 和 `docker compose`
- `/srv/jingjing-video-worker` 目录已建好
- `workers/video-worker` skeleton 文件已经复制到服务器
- `/srv/jingjing-video-worker/docker-compose.yml` 已存在
- `/srv/jingjing-video-worker/openstoryline` 和 `/srv/jingjing-video-worker/worker` 已存在
- `/srv/jingjing-video-worker/.env` 已填好并 chmod 600
- `docker compose config` 已通过

如果上面有任何一项没完成，不要开始做前端上传或 Worker 联调，不然很容易把问题混在一起。

## 6. 这份文档当前状态

说明清楚一点：

- 这份文档是 `Runbook / 操作说明`
- 它不是“已执行完成”的记录
- 真正点完 COS、Vercel、服务器以后，请把实际结果补到联调记录或下一份 progress 文档里

## 参考文档

以下是本轮写这份 runbook 时校准过的官方资料：

- 腾讯云 COS 临时密钥生成及使用指引：
  - https://cloud.tencent.com/document/product/436/14048
- 腾讯云 COS 前端直传临时密钥安全指引：
  - https://cloud.tencent.com/document/product/436/40265
- 腾讯云 COS CORS 配置说明：
  - https://cloud.tencent.com/document/product/436/8279
- 腾讯云 COS / CAM 权限接口列表：
  - https://cloud.tencent.com/document/product/598/69901
- 腾讯云 COS 用户策略说明：
  - https://cloud.tencent.com/document/product/436/68280
- Vercel 环境变量说明：
  - https://vercel.com/docs/environment-variables
  - https://vercel.com/docs/environment-variables/managing-environment-variables
