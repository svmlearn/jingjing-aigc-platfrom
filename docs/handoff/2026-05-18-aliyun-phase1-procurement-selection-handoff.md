# 2026-05-18 阿里云 Phase 1 采购选型 Handoff

## 1. 目标

执行任务书：

```text
docs/handoff/2026-05-18-aliyun-phase1-procurement-selection-task.md
```

目标是把 ECS / RDS PostgreSQL / OSS 的第一阶段采购选型定清楚，供产品负责人手动下单。

本轮不下单，不付款，不提交订单，不改 DNS，不提交 ICP，不保存密钥。

## 2. 分支 / 工作区

```text
worktree: /Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
branch: main
```

注意：

```text
主仓进入本轮前已有其他未提交/未跟踪文档改动。
本轮只新增本 handoff 和对应 progress 文档。
```

## 3. 结论

推荐 Phase 1 手动下单：

| 资源 | 推荐 |
| --- | --- |
| ECS | 华东1杭州，`ecs.c9i.2xlarge`，8C16G，Ubuntu 22.04，ESSD PL0 100GiB，公网 IPv4，按流量 5Mbps，1个月 |
| RDS PostgreSQL | 华东1杭州，PostgreSQL 18.0，基础系列，`pg.n2e.2c.1m`，2C4G，100GB，高性能云盘，1个月，内网访问 |
| OSS | 华东1杭州，私有 Bucket，标准存储，本地冗余，阻止公共访问开启，先按量付费 |

价格：

```text
ECS：¥793.64 / 月 + 公网流量
RDS PostgreSQL：¥168.00 / 月
OSS：建议先按量；100GB 标准本地冗余资源包页面当前显示 ¥54.78，但提示同周期资源包限制
低阻塞固定项：约 ¥961.64 / 月 + OSS 按量 + 流量/请求
```

如果同一台 ECS 要直接用于 ICP：

```text
ECS 购买时长改为 3 个月及以上。
按当前月价估算，ECS 3个月约 ¥2380.92 + 流量。
```

## 4. 域名 / ICP 风险

账号主体：

```text
阿里云账号中心显示当前账号认证主体为星阅科技****有限公司。
```

域名：

```text
当前阿里云域名控制台未看到 ba-ba-ke.com。
RDAP 显示 ba-ba-ke.com 注册商为 Alibaba Cloud / HiChina，DNS 为 DNSPod。
公开 RDAP 的 registrant 被隐私隐藏，无法作为实名匹配证据。
```

风险判断：

```text
域名在个人账号管理不是硬阻塞。
真正阻塞项是域名实名持有者、证件类型、证件号是否与备案主体一致。
当前账号无法直接核验 ba-ba-ke.com 域名实名主体，所以 ICP 前必须让域名管理账号持有人进入域名控制台核验。
```

## 5. 手动下单前检查

产品负责人下单前确认：

```text
ECS 自动续费：不勾选
RDS 自动续费：不勾选
ECS 用于技术验证：1个月
ECS 用于 ICP：3个月及以上
RDS 不开公网
OSS Bucket 私有，阻止公共访问开启
不创建公共读 Bucket
不把 AccessKey 发到聊天或写入 Git
```

## 6. 下单后给开发的输入

下单后需要给开发/Agent 的信息：

```text
ECS 公网 IP
ECS 内网 IP
ECS 地域 / 可用区 / VPC / 交换机
RDS 内网地址、端口、数据库名、用户名
OSS bucket
OSS region = oss-cn-hangzhou
OSS endpoint = oss-cn-hangzhou.aliyuncs.com
RAM AccessKey 只放入本机/服务器 env，不发聊天
```

本地验证 env 文件：

```text
/tmp/jingjing-aliyun-oss-validation.env
```

需要包含：

```text
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_ACCESS_KEY_ID 由本地/服务器 env 注入，文档不记录值
ALIYUN_OSS_ACCESS_KEY_SECRET 由本地/服务器 env 注入，文档不记录值
ALIYUN_OSS_BUCKET=<bucket>
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

## 7. 是否可以开 Batch 9C

不能。

本轮只是采购选型，真实阿里云 OSS 资源尚未创建，`aliyun_oss --roundtrip` 和 signed PUT 尚未通过。

下一步：

```text
人工下单 ECS/RDS/OSS
创建 OSS Bucket + RAM 最小权限
写入本地临时 env
重跑 Batch 9B-V 真实 Aliyun OSS validation
通过后再开 Batch 9C worker storage
```

## 8. 本轮变更文件

```text
docs/progress/2026-05-18-aliyun-phase1-procurement-selection.md
docs/handoff/2026-05-18-aliyun-phase1-procurement-selection-handoff.md
```

## 9. 未做事项

```text
未下单
未支付
未加入购物车/清单作为订单
未提交 ICP
未改 DNS
未创建 RAM AccessKey
未保存密钥
未做 worker/TTS/FireRed
未 merge main
未写 completion marker
```
