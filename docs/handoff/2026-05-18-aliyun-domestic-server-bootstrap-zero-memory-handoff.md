# 2026-05-18 阿里云国内服务器/RDS/OSS 接续配置交接

## 1. 这份文档给谁看

给之前那个已经参与国内化迁移讨论的 Codex 看。

它当时给用户的收口话是：

```text
买完后把 ECS 公网/内网 IP、地域、可用区、VPC/交换机、安全组；
RDS 内网地址、端口、数据库名、用户名、PostgreSQL 版本、VPC；
OSS bucket、region、endpoint、私有/CORS 状态；
以及 ECS/RDS 购买时长这些非敏感信息发回来。

不要发服务器密码、数据库密码、AccessKey ID/Secret、短信验证码、营业执照完整证件号、身份证号。

下单后下一步按顺序做：先连 ECS、装 Docker/基础环境、连 RDS、建库跑 migration、配 OSS env、跑 Aliyun OSS roundtrip，再部署 app/worker 验证。
```

现在用户已经买好了阿里云资源，准备在新对话里继续这条线。接下来要配置国内 ECS、RDS PostgreSQL、OSS，并把 `codex/domestic-infra-migration` 分支推进到真实阿里云资源验证。

本轮目标不是提交 ICP、不是改 DNS、不是把迁移分支合回 main，而是把新买的国内资源接起来，跑出可复核的技术验证。

## 2. 当前项目位置

主仓：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
branch: main
```

国内化迁移 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
latest known HEAD: 0c7c9af Batch 9B-V record Aliyun OSS validation blocker
remote: gitee/codex/domestic-infra-migration
```

进入迁移 worktree 后先执行：

```bash
git status --short
git branch --show-current
git log --oneline -5 --decorate
```

不要默认 merge main，不要写 `DOMESTIC_PHASE1_E2E_PASS`，不要标记 long-task complete。

## 3. 先读这些文档

采购和资源记录：

```text
docs/handoff/2026-05-18-aliyun-phase1-procurement-selection-handoff.md
docs/progress/2026-05-18-aliyun-phase1-resource-bootstrap.md
```

OSS 迁移分支状态：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-storage-provider-aliyun-oss-sdk-handoff.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/progress/2026-05-18-real-aliyun-oss-validation.md
```

## 4. 重要背景

此前曾初始化过一台 ECS：

```text
实例 ID：i-bp1bij48z9gt0yu2k7ag
公网 IP：47.96.227.254
内网 IP：172.27.156.19
```

但用户后来反馈这台 ECS 因折扣问题准备退款重购，随后又按原配置重新购买。

所以新会话里不要直接假设 `47.96.227.254 / 172.27.156.19 / i-bp1bij48z9gt0yu2k7ag` 仍然是最终服务器。第一步必须在阿里云 ECS 控制台核对最终实例，或者让用户提供最新 ECS 信息。

如果新 ECS 的内网 IP 变了，必须更新 RDS 白名单。旧 RDS 白名单里可能还保留旧 ECS 内网 IP `172.27.156.19`。

## 5. 已知购买口径

ECS 推荐并已要求沿用的配置：

```text
地域：华东1（杭州）
可用区：杭州 可用区K
实例规格：ecs.c9i.2xlarge，8 vCPU / 16 GiB
镜像：Ubuntu 22.04 64 位（安全加固）
系统盘：ESSD 100GiB PL0
公网带宽：固定 5Mbps
购买时长：3 个月
用途：国内 Phase 1 技术验证 + ICP 接入准备
```

RDS 已知信息：

```text
实例 ID：pgm-bp1p28yc1u41re78
地域 / 可用区：华东1（杭州）/ K
引擎：PostgreSQL 18.0
规格：2C4G
存储：100GB，高性能云盘
网络：内网 / VPC
内网地址：pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
内网 IP：172.27.156.21
端口：5432
购买时长：1 年
```

OSS 计划：

```text
地域：华东1（杭州）
Bucket：需要确认是否已经创建；如果没有，创建一个项目专用私有 Bucket
ACL：私有
阻止公共访问：开启
Endpoint：oss-cn-hangzhou.aliyuncs.com
ECS 内网 Endpoint：oss-cn-hangzhou-internal.aliyuncs.com
CORS：需要配置
```

## 6. 必须从用户/控制台确认的信息

ECS：

```text
实例 ID
实例名
公网 IP
内网 IP
地域 / 可用区
VPC
交换机
安全组
系统镜像
购买时长
是否已经重置密码或绑定密钥
```

RDS：

```text
RDS 实例 ID
内网地址
端口
VPC
白名单是否包含最终 ECS 内网 IP
业务数据库名
业务数据库用户名
是否已经创建账号和数据库
```

OSS：

```text
Bucket 名
Region
Endpoint
是否私有
是否开启阻止公共访问
CORS 是否已配置
是否已有 RAM 用户 / AccessKey / 最小权限策略
```

密钥和密码只允许放在本机或服务器 env 文件里，不写入聊天、文档、Git。

## 7. 推荐执行顺序

### 7.1 核对最终 ECS

在阿里云 ECS 控制台确认最终服务器。

如果用户要求 AI 操作浏览器，可以使用已登录 Chrome，但不要替用户点击支付、提交备案、保存 AccessKey 明文或提交不可逆动作。

确认后，把最终信息写入新的 progress，建议：

```text
docs/progress/2026-05-18-aliyun-domestic-resource-bootstrap.md
```

如果继续沿用已有 progress，也必须明确标出“旧 ECS 已废弃 / 新 ECS 最终信息”。

### 7.2 连上 ECS 并安装基础环境

如果是新 ECS，需要重新做基础初始化。

建议目录：

```text
/srv/jingjing-domestic/releases
/srv/jingjing-domestic/shared/env
/srv/jingjing-domestic/logs
/srv/jingjing-domestic/backups
```

`/srv/jingjing-domestic/shared/env` 权限建议为 `700`。

基础组件：

```text
Docker
Docker Compose plugin
Nginx
PostgreSQL client
git
jq
unzip
curl
ca-certificates
```

初始化后验证：

```bash
docker --version
docker compose version
nginx -v
psql --version
systemctl is-active docker
systemctl is-active nginx
```

### 7.3 更新 RDS 白名单

RDS 只开内网访问。

确认最终 ECS 内网 IP 后，把它加入 RDS 白名单。旧 ECS 如果已退款，可从白名单移除旧内网 IP。

从 ECS 验证端口：

```bash
pg_isready -h pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com -p 5432
```

### 7.4 创建 RDS 业务账号和数据库

如果还没创建，建议创建：

```text
database: jingjing_domestic
user: jingjing_app
```

密码由用户在控制台或终端安全输入，不要发到聊天里。

连接串只放服务器 env，例如：

```text
APP_DATABASE_URL=postgres://jingjing_app:<password>@pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com:5432/jingjing_domestic?sslmode=require
DATABASE_PROVIDER=postgres
```

验证：

```bash
PGPASSWORD='<不要写入文档>' psql "host=pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com port=5432 dbname=jingjing_domestic user=jingjing_app sslmode=require" -c "select version();"
```

### 7.5 创建/核对 OSS Bucket

如果还没创建，建议创建杭州项目 Bucket：

```text
Region: oss-cn-hangzhou
ACL: private
Block Public Access: enabled
```

CORS 初始建议：

```text
Allowed origins:
- 后续正式域名，例如 https://ba-ba-ke.com / https://*.ba-ba-ke.com
- 临时验证域名或本地开发 origin，按实际需要加

Allowed methods:
- GET
- HEAD
- PUT

Allowed headers:
- *

Expose headers:
- ETag
- x-oss-request-id

Max age:
- 3000 或控制台推荐值
```

如果创建 RAM AccessKey，权限要尽量收敛到目标 Bucket / prefix。AccessKey Secret 不写入文档，不发聊天。

本地验证 env 建议放：

```text
/tmp/jingjing-aliyun-oss-validation.env
```

服务器运行 env 建议放：

```text
/srv/jingjing-domestic/shared/env/app.env
```

示例只写 key，不写 secret 值：

```text
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_ACCESS_KEY_ID=<只放 env，不入库>
ALIYUN_OSS_ACCESS_KEY_SECRET=<只放 env，不入库>
ALIYUN_OSS_BUCKET=<bucket>
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_INTERNAL_ENDPOINT=oss-cn-hangzhou-internal.aliyuncs.com
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

### 7.6 回到迁移 worktree 跑 Aliyun OSS 真实验证

在迁移 worktree：

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
git status --short
```

先看 smoke 脚本参数：

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs --help
```

目标是跑真实 Aliyun OSS roundtrip：

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --provider aliyun_oss --roundtrip
```

还需要跑一次浏览器 signed PUT 上传链路验证。只有这两项通过后，才可以开 Batch 9C worker storage。

### 7.7 RDS schema migration

在迁移 worktree 先读：

```text
app/db/README.md
app/db/migrations/
```

按已有迁移顺序把 baseline/selfhost foundation/credits/storage provider 等迁移应用到阿里云 RDS。

迁移前后记录：

```text
迁移命令
目标 DB
应用了哪些 migration
表数量或关键表检查
是否可重复执行
```

不要把 DB 密码写进文档。

### 7.8 部署 app / worker 前的门槛

先完成：

```text
ECS 基础环境 ok
RDS 连接 ok
RDS migration ok
Aliyun OSS server roundtrip ok
Aliyun OSS signed PUT ok
```

再考虑把 `codex/domestic-infra-migration` 分支 clean release 部署到 ECS。

worker/TTS/FireRed/OpenStoryline 仍是后续阶段，不要和本轮 RDS/OSS 接线混在一起。

## 8. 当前不能做的事

```text
不要 merge main
不要 push/merge 未经用户确认的分支
不要写 DOMESTIC_PHASE1_E2E_PASS
不要标记 long-task complete
不要在文档或聊天里记录数据库密码、AccessKey Secret、cookie、token
不要假设旧 ECS 仍然存在
不要在 Aliyun OSS 真实验证通过前开 Batch 9C worker storage
不要把 ICP 提交、DNS 切换、支付/退款等不可逆动作交给 AI 自动完成
```

## 9. 做完后必须记录

如果本轮完成服务器配置或验证，请写 progress：

```text
docs/progress/2026-05-18-aliyun-domestic-resource-bootstrap.md
```

至少记录：

```text
最终 ECS 信息
RDS 白名单状态
RDS 账号/数据库是否创建，密码不记录
OSS Bucket/CORS/RAM 是否完成
执行过的验证命令与结论
哪些仍 pending
是否部署 app / worker
是否 push / merge
```

如果进入迁移 worktree 修改代码或新增验证记录，也要在迁移 worktree 的 `docs/progress/` 和 `docs/handoff/` 中单独留痕。

## 10. 给那个接续版 Codex 直接复制的提示词

```text
你现在接续之前那条“买完阿里云资源后继续配置 ECS/RDS/OSS”的线。

你之前已经知道：
- 主项目是“巴巴客 / 静境 AIGC 平台”。
- 另一个 AI 一直在 /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration 的 codex/domestic-infra-migration 分支干国内化迁移。
- 你当时让用户买完后把 ECS、RDS、OSS 的非敏感信息发回来，然后按顺序做：连 ECS、装 Docker/基础环境、连 RDS、建库跑 migration、配 OSS env、跑 Aliyun OSS roundtrip，再部署 app/worker 验证。
- 用户现在已经买好了资源，要继续实际配置。

请先阅读：
1. /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/AGENTS.md
2. /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/handoff/2026-05-18-aliyun-domestic-server-bootstrap-zero-memory-handoff.md
3. /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/handoff/2026-05-18-aliyun-phase1-procurement-selection-handoff.md
4. /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/progress/2026-05-18-aliyun-phase1-resource-bootstrap.md
5. /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md

当前要做的是：继续配置已经购买好的阿里云 ECS、RDS PostgreSQL、OSS，让迁移分支可以使用真实国内阿里云资源跑验证。

请注意：
- 之前初始化过的 ECS 可能已经因为折扣问题退款重购，不要默认旧公网 IP 47.96.227.254、旧内网 IP 172.27.156.19、旧实例 ID i-bp1bij48z9gt0yu2k7ag 仍然有效。
- 第一件事是核对最终 ECS 实例信息，必要时通过阿里云控制台读取。
- 如果新 ECS 内网 IP 变了，要更新 RDS 白名单。
- 不要把任何数据库密码、AccessKey Secret、token、cookie 写进聊天、文档或 Git。
- 不要自动点击支付、退款、提交 ICP、改 DNS、提交不可逆动作。
- 不要 merge main，不要写 DOMESTIC_PHASE1_E2E_PASS，不要标记 long-task complete。

推荐顺序：
1. 确认最终 ECS 公网 IP、内网 IP、实例 ID、地域/可用区、VPC、交换机、安全组、系统、购买时长。
2. SSH 连接 ECS；如果是新 ECS，安装 Docker、Docker Compose、Nginx、PostgreSQL client、git、jq、unzip，并创建 /srv/jingjing-domestic 目录结构。
3. 确认 RDS：pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com:5432；把最终 ECS 内网 IP 加入白名单；创建业务数据库和账号，密码只让用户自己输入或放 env。
4. 确认或创建杭州 OSS 私有 Bucket，开启阻止公共访问，配置 CORS，准备 RAM 最小权限 AccessKey。
5. 在 /tmp/jingjing-aliyun-oss-validation.env 写入本地验证 env，secret 值只在本机文件里，不展示。
6. 进入 /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration，确认 branch 是 codex/domestic-infra-migration，先跑 Aliyun OSS real roundtrip，再跑 signed PUT 验证。
7. OSS 真实验证通过后，再按 app/db/README.md 把 selfhost migrations 应用到阿里云 RDS。
8. 只有 RDS + OSS 都通过后，再考虑部署 clean release 到 ECS；worker storage Batch 9C 等 app 侧 Aliyun OSS roundtrip 和 signed PUT 都通过后再开。
9. 全程记录到 docs/progress/2026-05-18-aliyun-domestic-resource-bootstrap.md；如果改迁移分支，也在迁移 worktree 写 progress/handoff。

请先给我一个简短接管计划，然后开始核对资源和连接服务器。
```
