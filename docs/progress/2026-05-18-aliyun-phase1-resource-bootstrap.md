# 2026-05-18 阿里云 Phase 1 资源初始化记录

## 范围

本轮只做阿里云 Phase 1 资源盘点和基础初始化：

- 读取 ECS / RDS / OSS 基础信息。
- 通过 Workbench 免密登录 ECS，并加入本机 SSH 公钥，后续可从本机 SSH 管理。
- 在 ECS 安装基础运行环境：Docker、Docker Compose、Nginx、PostgreSQL client、git、jq、unzip。
- 放行 RDS 白名单中的 ECS 内网 IP。
- 验证 ECS 到 RDS 内网端口连通。

未做：

- 未部署应用。
- 未创建 RDS 数据库账号或业务数据库，因为需要产品方自行设定并保管密码。
- 未创建新的 OSS Bucket，因为当前还需要确认 Bucket 名称。
- 未写业务密钥、未保存 AccessKey、未改 DNS、未提交 ICP。

## ECS

- 实例名：launch-advisor-20260518
- 实例 ID：i-bp1bij48z9gt0yu2k7ag
- 地域 / 可用区：华东1（杭州）/ K
- 公网 IP：47.96.227.254
- 内网 IP：172.27.156.19
- VPC：vpc-bp15fcpbsrgzp9zs5hxx2
- 交换机：vsw-bp1laydq1pucnxugyr54i
- 安全组：sg-bp1hnbjy7dqbhesc4g2f
- 系统：Ubuntu 22.04 64 位
- 规格：ecs.c9i.2xlarge，8 vCPU / 16 GiB
- 到期时间：2026-08-18 16:00:00Z / 控制台本地显示 2026-08-18 23:59:59
- 购买时长判断：约 3 个月，满足当前 ICP 备案服务器时长口径。

安全组当前入方向可见规则：

- ICMP：0.0.0.0/0
- SSH 22：0.0.0.0/0
- HTTP 80：0.0.0.0/0
- HTTPS 443：0.0.0.0/0

## ECS 基础环境

已通过 SSH 初始化：

- Docker version 29.5.0
- Docker Compose version v5.1.3
- nginx/1.18.0
- psql 14.22

已创建目录：

- /srv/jingjing-domestic/releases
- /srv/jingjing-domestic/shared/env
- /srv/jingjing-domestic/logs
- /srv/jingjing-domestic/backups

其中 `/srv/jingjing-domestic/shared/env` 权限为 700，用于后续放置不入库的环境变量文件。

服务状态验证：

- docker：active
- nginx：active

## RDS PostgreSQL

- 实例 ID：pgm-bp1p28yc1u41re78
- 地域 / 可用区：华东1（杭州）/ K
- 引擎：PostgreSQL 18.0
- 规格：pg.n2e.2c.1m
- 存储：100GB，高性能云盘 general_essd
- 网络类型：Intranet
- VPC：vpc-bp15fcpbsrgzp9zs5hxx2
- 交换机：vsw-bp1laydq1pucnxugyr54i
- 内网连接地址：pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
- 内网 IP：172.27.156.21
- 端口：5432
- 到期时间：2027-05-18T16:00:00Z
- 购买时长判断：1 年

白名单：

- default：127.0.0.1,172.27.156.19
- hdm_security_ips：100.104.172.0/24,100.104.220.0/24

当前账号 / 数据库：

- DescribeAccounts 返回空。
- DescribeDatabases 返回空。

连通性：

- ECS 上执行 `pg_isready -h pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com -p 5432`，结果为 `accepting connections`。

## OSS

当前账号 OSS Bucket 列表：

- jingwutuan：oss-cn-hongkong，Standard，本地冗余
- pros：oss-cn-hongkong，Standard，本地冗余
- zhihuixinan：oss-cn-hongkong，Standard，本地冗余
- jing5tuan：oss-cn-shenzhen，Standard，同城冗余

结论：

- 当前没有看到华东1（杭州）/ `oss-cn-hangzhou` 的项目 Bucket。
- 需要后续创建一个私有 Bucket，再配置 CORS。
- Aliyun OSS 真实 roundtrip / signed PUT 验证仍不能开始，直到 Bucket、CORS、RAM AK/STS 或等价凭证齐备。

## 下一步

1. 确认并创建项目 OSS Bucket，建议地域 `oss-cn-hangzhou`，ACL 私有，阻止公共访问开启。
2. 配置 OSS CORS：允许未来正式域名、本地/临时验证域名，方法至少包含 GET/HEAD/PUT，暴露 ETag。
3. 在 RDS 创建业务数据库和账号；密码由产品方自行输入/保管，不写入聊天和仓库。
4. 把 RDS/OSS 的非密钥信息和密钥占位写入 ECS 的 `/srv/jingjing-domestic/shared/env/`。
5. 让 `codex/domestic-infra-migration` 分支继续执行 Aliyun OSS 真实 roundtrip、RDS schema migration、应用 clean release 部署。

