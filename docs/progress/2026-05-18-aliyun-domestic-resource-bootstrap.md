# 2026-05-18 阿里云国内资源初始化记录

## 最终资源核对

核对时间：2026-05-18 19:46 CST  
核对方式：阿里云控制台只读核对。

本轮只做 ECS / RDS PostgreSQL / OSS / RAM 资源现状核对和文档记录。未点击支付、退款、续费、提交 ICP、修改 DNS、创建 AccessKey、展示 AccessKey Secret、重置密码、部署应用或合并分支。

### ECS

结论：已找到最终 ECS。它不是此前初始化记录里的旧实例 `i-bp1bij48z9gt0yu2k7ag`，公网 IP / 内网 IP 也已变化。

- 实例 ID：`i-bp190gb0a3ajywl6urzk`
- 实例名称：`launch-advisor-20260518`
- 当前运行状态：运行中
- 地域 / 可用区：华东1（杭州）/ K（`cn-hangzhou-k`）
- 公网 IP：`8.154.28.41`
- 内网 IP：`172.27.156.22`
- VPC：`vpc-bp15fcpbsrgzp9zs5hxx2`
- 交换机：`vsw-bp1laydq1pucnxugyr54i`
- 安全组：`sg-bp1hnbjy7dqbhesc4g2f`
- 镜像 / 系统版本：Ubuntu 22.04 64 位（控制台详情页未显示“安全加固”字样）
- 规格：`ecs.c9i.2xlarge`，8 vCPU / 16 GiB
- 系统盘：`d-bp190gb0a3ajywl92oyc`，ESSD 云盘，100 GiB
- 公网带宽：按固定带宽，5 Mbps
- 付费类型：包年包月
- 创建时间：2026-05-18 19:17:00
- 到期时间：2026-08-18 23:59:59
- 购买时长判断：约 3 个月

当前安全组入方向可见规则：

- ICMP IPv4：`0.0.0.0/0`
- SSH 22：`0.0.0.0/0`
- HTTPS 443：`0.0.0.0/0`
- HTTP 80：`0.0.0.0/0`

### RDS PostgreSQL

- 实例 ID：`pgm-bp1p28yc1u41re78`
- 当前运行状态：运行中
- 地域 / 可用区：华东1（杭州）/ K
- PostgreSQL 版本：PostgreSQL 18.0
- 类型及系列：常规实例（基础系列）
- 规格族：通用型
- 实例规格：`pg.n2e.2c.1m`
- CPU / 内存：2 核 / 4096 MB
- 存储：高性能云盘，100 GB
- 内网地址：`pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com`
- 内网端口：5432
- 网络类型：专有网络
- VPC：`vpc-bp15fcpbsrgzp9zs5hxx2`
- 交换机：`vsw-bp1laydq1pucnxugyr54i`
- 创建时间：2026-05-18 15:49:21
- 到期时间：2027-05-19 00:00:00

白名单现状：

- `default`：`127.0.0.1,172.27.156.19`
- `hdm_security_ips`：阿里云内部诊断相关网段，控制台标记为隐藏分组
- 结论：当前白名单没有包含最终 ECS 内网 IP `172.27.156.22`，需要后续更新；旧 ECS 内网 IP `172.27.156.19` 仍在 `default` 分组中。

账号 / 数据库现状：

- 账号管理：没有数据
- 数据库管理：没有数据
- 结论：尚未创建业务数据库和业务账号；未记录也未接触任何数据库密码。

### OSS

结论：未看到最终杭州项目 Bucket。当前 OSS Bucket 列表只有既有 Bucket：

- `jingwutuan`：中国香港，标准存储，本地冗余
- `pros`：中国香港，标准存储，本地冗余
- `zhihuixinan`：中国香港，标准存储，本地冗余
- `jing5tuan`：华南1（深圳），标准存储，同城冗余

最终项目 Bucket 状态：

- 是否已创建 Bucket：未创建 / 未看到杭州项目 Bucket
- Bucket 名：待定
- Region：待定；建议仍按计划使用华东1（杭州）/ `oss-cn-hangzhou`
- Endpoint：最终 Bucket 未创建，实际 endpoint 待定；杭州公网 endpoint 规划为 `oss-cn-hangzhou.aliyuncs.com`
- 是否私有：待创建时确认
- 是否开启阻止公共访问：最终 Bucket 待创建；当前 OSS 控制台“阻止公共访问”全局页显示未开启
- CORS：最终 Bucket 未创建，未配置

RAM / AccessKey 状态：

- 控制台仅看到 1 个历史 RAM 用户，未看到本项目专用、杭州 Bucket 级别的最小权限凭证。
- 本轮未进入 AccessKey 明细页，未创建 AccessKey，未展示或记录任何 AccessKey ID / Secret。
- 因最终 Bucket 尚未创建，Bucket 级最小权限策略和凭证仍是待办项。

## 待办

1. 将 RDS 白名单 `default` 更新为包含最终 ECS 内网 IP `172.27.156.22`；确认旧 ECS 已废弃后再移除 `172.27.156.19`。
2. 创建 RDS 业务数据库和业务账号，密码由用户自行输入和保管，不写入聊天、文档或 Git。
3. 创建杭州 OSS 私有 Bucket，开启阻止公共访问，配置 CORS。
4. 为最终 OSS Bucket 创建最小权限 RAM 策略和凭证；不要在文档或聊天中记录 AccessKey Secret。
5. 资源接线完成后，再进入 `codex/domestic-infra-migration` 分支执行 Aliyun OSS roundtrip、signed PUT、RDS migration 和后续部署验证。

## 本轮未做

- 未部署 app / worker。
- 未 SSH 连接 ECS。
- 未修改 RDS 白名单。
- 未创建 RDS 数据库或账号。
- 未创建 OSS Bucket。
- 未创建、查看或记录 AccessKey Secret。
- 未改 DNS，未提交 ICP，未 push / merge。
- 未写 `DOMESTIC_PHASE1_E2E_PASS`，未标记 long-task complete。

## 资源接线执行记录（2026-05-18 22:19 CST）

执行方式：阿里云控制台当前资源为准。本轮只做 RDS / OSS / RAM 云资源接线；未部署 app / worker，未 SSH 初始化 ECS，未修改 DNS，未提交 ICP，未 merge `main`，未写 `DOMESTIC_PHASE1_E2E_PASS`，未标记 long-task complete。

### RDS PostgreSQL 接线结果

- RDS 实例：`pgm-bp1p28yc1u41re78`
- `default` 白名单已包含最终 ECS 内网 IP：`172.27.156.22`
- `default` 白名单保留旧内网 IP：`172.27.156.19`
- `default` 白名单当前包含：`127.0.0.1,172.27.156.19,172.27.156.22`
- 未开启 RDS 公网访问。
- 业务账号：`jingjing_app` 已创建，类型为普通账号，状态已激活；密码由用户在控制台输入和保管，未写入聊天、文档或 Git。
- 业务数据库：`jingjing_domestic` 已创建，字符集 UTF8，Collate 为 `C`，Ctype 为 `en_US.utf8`，已绑定账号 `jingjing_app`。

### OSS Bucket 接线结果

- Bucket 已创建：`jingjing-domestic-phase1-hz`
- Region：华东1（杭州）/ `oss-cn-hangzhou`
- 公网 Endpoint：`oss-cn-hangzhou.aliyuncs.com`
- ECS 内网 Endpoint：`oss-cn-hangzhou-internal.aliyuncs.com`
- Bucket 域名：`jingjing-domestic-phase1-hz.oss-cn-hangzhou.aliyuncs.com`
- ECS 内网 Bucket 域名：`jingjing-domestic-phase1-hz.oss-cn-hangzhou-internal.aliyuncs.com`
- ACL：私有
- 阻止公共访问：已开启
- 存储类型：标准存储
- 冗余类型：本地冗余存储
- 版本控制：未开通
- 服务端加密：无

### OSS CORS 接线结果

CORS 已创建 1 条规则。控制台提示跨域规则可能在设置成功后 15 分钟内生效。

- Allowed Origins：
  - `http://8.154.28.41`
  - `http://43.160.208.189`
  - `http://127.0.0.1:3000`
- Allowed Methods：GET、PUT、HEAD
- Allowed Headers：`*`
- Expose Headers：`ETag`、`x-oss-request-id`
- MaxAgeSeconds：`0`
- 后续备案域名完成后，再追加 `app.ba-ba-ke.com` 对应 Origin。

### RAM 最小权限接线结果

- RAM 自定义策略已创建：`jingjing-domestic-phase1-oss-prefix-policy`
- RAM 用户已创建：`jingjing-domestic-oss-phase1`
- 已将自定义策略绑定到 RAM 用户 `jingjing-domestic-oss-phase1`
- 该 RAM 用户当前 AccessKey 数量：0
- 本轮未创建、展示、复制或保存任何 AccessKey Secret，也未记录完整 AccessKey ID。
- 创建 RAM 策略 / 用户时触发过阿里云安全验证，由用户在控制台自行完成；验证码未进入聊天或文档。

策略动作范围：

- `oss:PutObject`
- `oss:GetObject`
- `oss:DeleteObject`
- `oss:GetObjectMeta`

策略资源范围：

- `acs:oss:*:*:jingjing-domestic-phase1-hz/app-storage-provider-smoke/*`
- `acs:oss:*:*:jingjing-domestic-phase1-hz/source-assets/*`
- `acs:oss:*:*:jingjing-domestic-phase1-hz/draft-inputs/*`
- `acs:oss:*:*:jingjing-domestic-phase1-hz/knowledge/*`

### 仍需用户人工输入 / 确认

1. RDS 账号 `jingjing_app` 的密码由用户自行安全保存，后续部署或迁移时写入安全 env，不写入文档或 Git。
2. 后续如应用需要 OSS 凭证，用户需要为 RAM 用户 `jingjing-domestic-oss-phase1` 自行创建 AccessKey，并把 Secret 仅保存到本地 / 服务器安全 env；不要发到聊天或提交到 Git。
3. 备案域名可用后，补充 OSS CORS Origin：`app.ba-ba-ke.com` 对应协议域名。
4. 下一轮再执行 RDS migration、OSS roundtrip / signed PUT 验证和 app / worker 部署；本轮未做这些验证。
