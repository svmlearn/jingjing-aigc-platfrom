# 2026-05-18 阿里云 Phase 1 采购选型记录

## 1. 本轮目标

本轮只做采购选型，不下单。

范围：

```text
ECS
RDS PostgreSQL
OSS
账号主体 / 域名 / ICP 风险
OSS CORS / RAM 权限方案
```

明确未做：

```text
未点击确认下单 / 立即购买 / 支付
未创建 OSS Bucket
未创建 RAM AccessKey
未改 DNS
未提交 ICP
未保存或打印任何密钥
未做 worker / TTS / FireRed
未写 completion marker
```

## 2. 控制台与官方资料来源

控制台核对时间：

```text
2026-05-18
```

使用账号：

```text
阿里云主账号 peacel****
账号中心显示认证主体：星阅科技****有限公司
统一社会信用代码：已在控制台显示，但本文不记录完整号码
```

官方规则参考：

- 域名实名与备案主体不一致处理：https://help.aliyun.com/zh/icp-filing/how-to-deal-with-the-inconsistency-between-the-domain-name-real-name-authentication-information-and-the-filing-subject-information
- 域名与服务器不同服务商备案：https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/domain-name-and-how-the-server-is-not-in-the-same-service-provider-for-the-record
- 备案前服务器及接入信息检查：https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check

关键规则记录：

```text
ECS 用于阿里云 ICP 备案时，服务器需要位于中国内地，计费方式为包年包月，购买时长大于 3 个月（含续费累计），且需要购买公网带宽。
域名可以不在阿里云购买；服务器在阿里云时，可以通过阿里云备案系统提交，但域名实名信息必须满足域名核验要求。
域名实名信息需与备案订单中的主体信息一致；企业备案时需与主办单位或主体负责人信息一致。
```

## 3. 最终推荐清单

### 3.1 ECS

推荐购买：

| 项 | 选择 |
| --- | --- |
| 产品 | 云服务器 ECS |
| 地域 | 华东 1（杭州） |
| 计费 | 包年包月 |
| 购买时长 | 1 个月，Phase 1 技术验证 |
| 实例 | `ecs.c9i.2xlarge` |
| 规格 | 8 vCPU / 16 GiB |
| 镜像 | Ubuntu 22.04 LTS 64 位 |
| 系统盘 | ESSD PL0 100 GiB |
| 数据盘 | 暂不购买 |
| 公网 IPv4 | 开通 |
| 带宽计费 | 按使用流量 |
| 带宽峰值 | 5 Mbps |
| 安全组 | 新建普通安全组 |
| 放通端口 | 22 / 80 / 443 / ICMP |
| 不放通 | 3389；worker/FireRed/OpenStoryline 内部端口 |
| 登录凭证 | 创建后设置 |
| 实例名 | `jingjing-domestic-phase1` |
| 自动续费 | 不勾选 |

控制台价格证据：

```text
ecs.c9i.2xlarge 参考价格：¥743.64/月
系统盘 ESSD PL0 100GiB 后，1 个月配置费用：¥793.64
公网流量：后付费，按实际使用另计
```

说明：

```text
1 个月 ECS 适合 Phase 1 IP / 临时 URL 技术验证。
如果要立即用于 ICP 备案，应把 ECS 购买时长改为 3 个月及以上。
```

### 3.2 RDS PostgreSQL

推荐购买：

| 项 | 选择 |
| --- | --- |
| 产品 | 云数据库 RDS PostgreSQL |
| 地域 | 华东 1（杭州），与 ECS 同地域 |
| 计费 | 包年包月 |
| 购买时长 | 1 个月 |
| 引擎 | PostgreSQL 18.0，页面当前可选版本 |
| 产品系列 | 基础系列 |
| 部署 | 单可用区 |
| 存储类型 | 高性能云盘 |
| 规格 | `pg.n2e.2c.1m` |
| CPU / 内存 | 2 核 / 4 GB |
| 最大连接数 | 400 |
| 存储 | 100 GB |
| 网络 | 专有网络，与 ECS 同 VPC |
| 公网访问 | 不开 |
| 白名单 | 仅 ECS 所在 VPC / 内网段 |
| 端口 | 5432 |
| 时区 | Asia/Shanghai |
| 自动续费 | 不勾选 |

控制台价格证据：

```text
基础系列 PostgreSQL 18.0
pg.n2e.2c.1m，2 核 4GB，100GB 高性能云盘，1 个月
配置费用：¥168.00
```

备选：

```text
如果担心 pg.n2e 系列过于低成本，可选同为 2 核 4GB 的 pg.n2.2c.1m。
页面参考规格价为 ¥156/月，不含 100GB 存储最终配置价；最终以下单页为准。
```

本阶段判断：

```text
Phase 1 推荐 pg.n2e.2c.1m 即可。
素材二进制放 OSS，数据库主要保存业务元数据、任务状态、授权记录和索引字段。
当前不要求高可用 PostgreSQL；进入稳定付费、停机影响交付或用户量明显增加后再升级。
```

### 3.3 OSS

推荐先做：

| 项 | 选择 |
| --- | --- |
| 产品 | 对象存储 OSS |
| 地域 | 华东 1（杭州），与 ECS/RDS 同地域 |
| Bucket ACL | 私有 |
| 阻止公共访问 | 开启 |
| 存储类型 | 标准存储 |
| 冗余 | 本地冗余 LRS |
| 版本控制 | Phase 1 关闭 |
| 生命周期 | Phase 1 可先不配；验证通过后再做临时素材清理策略 |
| 计费 | 先按量付费；资源包视账号已有资源包状态再决定 |

Bucket 命名建议：

```text
jingjing-domestic-phase1-<short-suffix>
```

App env 建议：

```text
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_BUCKET=<实际 bucket>
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

不记录：

```text
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
```

控制台价格证据：

```text
OSS 资源包页，标准 - 本地冗余存储，100GB，1个月：页面显示应付费用 ¥54.78。
同一页面提示“该商品在同一时段只能购买1次，您可以选择续费或者升级当前的商品订购”。
```

结论：

```text
Phase 1 不建议被 OSS 资源包卡住。
先创建私有 Bucket 并按量付费跑通真实 roundtrip / signed PUT。
如果老板希望锁定预算，再由人工确认当前账号是否已有资源包，以及 100GB 资源包是新购、续费还是升级。
```

## 4. 预算

### 4.1 Phase 1 一个月技术验证

| 资源 | 选型 | 预算 |
| --- | --- | ---: |
| ECS | `ecs.c9i.2xlarge` 8C16G + ESSD PL0 100GiB | ¥793.64 / 月 |
| RDS PostgreSQL | 基础系列 `pg.n2e.2c.1m` 2C4G + 100GB | ¥168.00 / 月 |
| OSS | 私有 Bucket，先按量付费 | 低，按实际存储/请求/流量计 |
| OSS 资源包备选 | 标准本地冗余 100GB / 1个月 | 当前账号页面显示 ¥54.78，但存在资源包同周期限制提示 |
| 公网流量 | ECS 按使用流量，OSS 外网流出另计 | 按实际使用 |

低阻塞推荐口径：

```text
首月固定项约 ¥961.64 + OSS 按量费用 + ECS/OSS 流量费用。
如同时买当前页面显示的 OSS 100GB 资源包，则约 ¥1016.42 + 流量/请求等后付费项。
```

### 4.2 如果同一台 ECS 要立即用于 ICP

阿里云官方文档要求用于备案的 ECS 购买时长大于 3 个月且有公网带宽。

估算：

```text
ECS 3 个月：¥793.64 * 3 = ¥2380.92
RDS 1 个月：¥168.00
OSS：先按量或按资源包页面人工确认
```

说明：

```text
如果今天只是技术验证，ECS 买 1 个月即可。
如果今天就想作为备案服务器提交 ICP，ECS 应直接买 3 个月及以上。
```

## 5. OSS CORS

用于 Batch 9B-V signed PUT 验证的 Bucket CORS：

```text
Allowed Origins:
- http://127.0.0.1:<local-port>，如果本地浏览器验证
- http://43.160.208.189，如果继续用新加坡 IP-stage 页面做验证
- https://app.ba-ba-ke.com，备案和 HTTPS 后再追加

Allowed Methods:
- PUT
- GET
- HEAD

Allowed Headers:
- Content-Type
- 或 *

Expose Headers:
- ETag
- x-oss-request-id

Vary Origin:
- 多来源时启用
```

注意：

```text
Batch 9B 使用 signed PUT URL。
PUT 请求的 Content-Type 必须与后端生成签名时一致。
不要把 Bucket 改成公共读来绕过 CORS。
```

## 6. RAM 权限

Phase 1 推荐新建最小权限 RAM 用户或 RAM 角色，只用于 app OSS 验证。

最小动作：

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta
```

建议前缀：

```text
app-storage-provider-smoke/*
source-assets/*
draft-inputs/*
knowledge/*
```

不建议：

```text
不要长期使用主账号 AccessKey。
不要把 AccessKey 写进 Git、docs、聊天记录。
不要授予全局 OSS 管理员权限作为长期方案。
```

如果为了首次排障临时放宽权限，必须在验证记录里写：

```text
temporary broad policy used; must narrow before production
```

## 7. 域名与 ICP 风险

### 7.1 阿里云账号主体

控制台账号中心显示：

```text
当前账号认证主体：星阅科技****有限公司
```

这满足“用阿里云企业账号采购和备案”的方向。

### 7.2 ba-ba-ke.com 当前可见状态

当前阿里云域名控制台：

```text
该账号域名列表显示 7 个域名。
未看到 ba-ba-ke.com。
```

RDAP / DNS 可见：

```text
ba-ba-ke.com 注册商：Alibaba Cloud Computing Ltd. d/b/a HiChina (www.net.cn)
Nameserver：cake.dnspod.net / judy.dnspod.net
A 记录：
- ba-ba-ke.com -> 198.18.0.56
- www.ba-ba-ke.com -> 198.18.0.57
- app.ba-ba-ke.com -> 198.18.0.58
- api.ba-ba-ke.com -> 198.18.0.59
```

RDAP 注意：

```text
公开 RDAP 中 registrant 信息被 Redacted for Privacy。
公开 RDAP 的 kind 字段显示 individual，但这不能替代阿里云域名控制台实名模板核验。
```

风险结论：

```text
ICP 最大风险不是“域名在个人账号管理”，而是“域名实名持有者 / 证件类型 / 证件号是否与备案主体一致”。
当前企业阿里云账号里看不到 ba-ba-ke.com，无法在本账号直接核验域名实名主体。
必须由掌握 ba-ba-ke.com 域名管理账号的人进入域名控制台，查看域名持有者信息和信息模板。
如果实名主体确为星阅科技****有限公司，且证件类型/证件号与备案主体一致，则个人账号管理不是硬阻塞。
如果实名主体是个人或证件信息不一致，应先做域名信息模板变更/过户，再提交 ICP。
```

DNS 风险：

```text
当前 DNS 在 DNSPod，不在本阿里云账号 DNS 控制台内。
下单 ECS/RDS/OSS 不需要先改 DNS。
ICP备案和后续切流前，需要确认 DNSPod 控制权可用。
不要现在改 ba-ba-ke.com 解析。
```

## 8. 手动下单步骤

### 8.1 ECS

1. 打开阿里云 ECS 自定义购买页。
2. 选择 `包年包月`。
3. 地域选 `华东1（杭州）`。
4. 实例选 `ecs.c9i.2xlarge`，8 vCPU / 16 GiB。
5. 镜像选 Ubuntu 22.04 LTS 64 位。
6. 系统盘选 ESSD PL0，100 GiB。
7. 不加数据盘。
8. 开通公网 IPv4。
9. 带宽计费选按使用流量，峰值 5 Mbps。
10. 新建安全组，放通 22 / 80 / 443 / ICMP，不放通 3389。
11. 登录凭证选创建后设置。
12. 实例名填 `jingjing-domestic-phase1`。
13. 购买时长：
    - 只做技术验证：1 个月。
    - 同时作为 ICP 备案服务器：3 个月及以上。
14. 自动续费不勾选。
15. 人工确认协议后再下单。

### 8.2 RDS PostgreSQL

1. 打开 RDS PostgreSQL 标准创建页。
2. 选择 `包年包月`。
3. 地域选 `华东1（杭州）`。
4. 引擎选 PostgreSQL 18.0。
5. 产品系列选基础系列。
6. 存储类型选高性能云盘。
7. VPC 选与 ECS 相同 VPC。
8. 白名单选择加入 VPC 网段，后续收紧到 ECS 内网来源。
9. 部署方案选单可用区。
10. 规格选 `pg.n2e.2c.1m`，2 核 4GB。
11. 存储选 100GB。
12. 购买时长 1 个月。
13. 自动续费不勾选。
14. 不开启公网访问。
15. 人工确认协议后再下单。

### 8.3 OSS

1. 打开 OSS 控制台。
2. 新建 Bucket。
3. 地域选华东 1（杭州）。
4. Bucket ACL 选私有。
5. 阻止公共访问保持开启。
6. 存储类型选标准存储。
7. 冗余选本地冗余。
8. 版本控制关闭。
9. 按上文配置 CORS。
10. 新建 RAM 用户或角色，授予上文最小 OSS 权限。
11. AccessKey 只放到服务器环境变量，不写入 Git/docs/chat。

资源包：

```text
先不强制购买 OSS 资源包。
如要买，人工确认当前账号已有资源包状态后，再决定新购/续费/升级 100GB 标准本地冗余包。
```

## 9. 是否可以进入 Batch 9C

不能。

原因：

```text
本轮是采购选型，不是实际下单和真实 OSS 验证。
Aliyun OSS server roundtrip 和 signed PUT 仍未通过。
```

进入 Batch 9C 前必须先完成：

```text
1. 人工下单 ECS/RDS/OSS。
2. 创建私有 OSS Bucket。
3. 创建最小权限 RAM 凭证。
4. 在 /tmp/jingjing-aliyun-oss-validation.env 写入真实 ALIYUN_OSS_* env。
5. 跑通 node app/scripts/check-domestic-storage-provider-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --provider aliyun_oss --roundtrip。
6. 跑通 signed PUT 验证。
```

