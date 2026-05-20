# 2026-05-14 服务器采购与国内化迁移零上下文交接

## 1. 这份文档是干嘛的

这份 handoff 是给新窗口 / 新 Agent 看的，目标是不用翻聊天记录，也能继续接上两件事：

1. 下一套云资源怎么买：大陆路线已定，正式云厂商统一阿里云。
2. `codex/domestic-infra-migration` 这个国内化代码改造 worktree 现在停在哪个断点。

当前用户目标：

```text
已确认 ba-ba-ke.com 是国内公司主体，只是当前挂在新加坡服务器。
正式路线统一阿里云：ECS + RDS PostgreSQL + OSS。
周末先用现有新加坡 2 核 4G 服务器自建 PostgreSQL，跑通 Supabase + Vercel 替换 rehearsal。
下周一用公司阿里云企业账号采购国内资源，并同步启动 ICP。
资源买好后，再回到国内化迁移 worktree 做真实资源验证。
```

## 2. 主仓库当前状态

主仓库路径：

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

当前分支：

```text
main
```

写这份 handoff 前，main 上最近几个相关提交是：

```text
af44893 docs: add dify siliconflow v32 test results
63ddd3e docs: add hong kong deployment decision notes
c5e0ace docs: add domestic server purchase comparison
```

写这份 handoff 时，main 的 `git status --short` 是干净的。

新窗口优先读这些文档：

```text
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
docs/handoff/2026-05-13-国内化代码改造与迁移计划表.md
docs/handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md
```

## 3. 服务器采购决策当前状态

2026-05-15 用户补充事实：

```text
ba-ba-ke.com 实际是国内公司主体。
当前只是解析 / 部署在新加坡服务器。
此前担心“域名卡在香港公司主体”的前提不成立。
```

因此当前采购路线已经从“大陆 vs 香港待定”收敛为：

```text
优先大陆路线。
香港路线仅作为大陆备案或采购临时受阻时的快速试运营备选。
```

正确决策顺序是：

```text
1. 默认大陆路线；只在备案或主体资料临时受阻时评估香港备选。
2. 云厂商已定：正式国内资源统一阿里云。
3. 再买：阿里云同一区域或近区域的一整套资源。
4. 资源买完后，才恢复国内化迁移 worktree 的真实资源验证。
```

如果还没确认阿里云企业账号实名主体、ICP备案材料和服务器购买时长要求，不要直接进入正式备案型购买；phase1 IP 验证服务器仍可先买短期资源。

## 4. 域名 / ICP / 公司主体当前状态

2026-05-15 已更新：

```text
域名：ba-ba-ke.com
已知：域名是国内公司主体。
已知：当前只是挂在 / 解析到新加坡服务器。
结论：域名主体不再阻塞大陆路线。
```

接下来仍要确认 / 记录清楚：

1. 国内公司是否可以统一承担：阿里云账号实名、域名实名、ICP备案、服务器、对象存储、数据库。
2. 域名注册商控制权和 DNSPod 解析权限是否都在手里。
3. 备案材料是否齐全：营业执照、法人 / 网站负责人信息、手机号、邮箱等。
4. 如果要让这台大陆服务器参与备案，购买时长是否要按云厂商备案要求选择 3 个月及以上。
5. phase1 是否先买 1 个月 IP 验证资源，备案型长期资源后置。

决策规则：

| 情况 | 优先路线 |
| --- | --- |
| `ba-ba-ke.com` 已是国内公司主体，并且能做 ICP | 大陆服务器 + 大陆对象存储 + 大陆 PostgreSQL |
| 大陆备案材料或企业采购流程临时受阻，且需要快速试运营 | 香港服务器 + 香港对象存储 + 香港 PostgreSQL |
| 只是 phase1 技术验证 | 可以先用服务器 IP 验证，不被域名/ICP/HTTPS 卡住 |
| 最终要给国内房产中介长期稳定使用 | 如果 ICP 可行，优先大陆路线 |

## 5. 大陆路线怎么走

适用前提：国内公司、域名、ICP备案这条路能走通。

推荐形态：

```text
国内公司实名阿里云企业账号
-> 阿里云大陆 ECS
-> 阿里云 RDS PostgreSQL
-> 阿里云 OSS bucket
-> 已 ICP 备案域名
-> HTTPS
-> 中介端 / 成员端 PWA
```

关键点：

- phase1 验证可以先用 `http://<服务器IP>`。
- 正式 PWA 建议用 `https://<域名>`。
- PWA 需要 HTTPS 才稳定支持 Service Worker；ICP备案不是 PWA 本身的要求，而是大陆服务器/大陆接入的要求。
- 备案时主体最好一致：云账号实名主体、域名持有人、ICP备案主体、实际业务主体尽量都用同一个国内公司。
- 如果要用大陆服务器做备案，服务器购买时长通常要 3 个月及以上。

大陆服务器已记录过两套购买配置：

```text
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
```

已记录的大陆配置：

| 云厂商 | 服务器 | 地域 | 系统 | 磁盘 | 网络 | 页面价格 |
| --- | --- | --- | --- | --- | --- | ---: |
| 腾讯云 | CVM `C6.2XLARGE16`，8核16G | 上海 | Ubuntu 22.04 | 100 GiB | 按流量，5 Mbps | `¥980.00` + `¥0.80/GB` |
| 阿里云 | ECS `ecs.c9i.2xlarge`，8核16G | 杭州 | Ubuntu 22.04 | 100 GiB | 按使用流量，5 Mbps | `¥793.64` + 流量费 |

当前大陆云厂商判断：

- 2026-05-15 晚间已更新：公司已有阿里云企业账号，正式国内资源统一走阿里云。
- 阿里云 ECS 当前价格更低，且采购、发票、实名、备案主体更容易统一。
- 不建议服务器在阿里云、对象存储在腾讯云、数据库又在第三家。短期能跑，长期排障会烦。

## 6. 香港路线怎么走

适用前提：大陆备案材料、企业采购或主体资料临时卡住，且用户想先快速试运营，不想等大陆 ICP。

推荐形态：

```text
香港服务器
-> 香港 PostgreSQL
-> 香港对象存储 bucket
-> ba-ba-ke.com 配 HTTPS
-> 国内用户手机访问 PWA
```

已确认的香港资源可用性：

| 云厂商 | 服务器 | 对象存储 | PostgreSQL | 备注 |
| --- | --- | --- | --- | --- |
| 腾讯云 | 香港 CVM，`ap-hongkong` | 香港 COS bucket | 香港 TencentDB for PostgreSQL | 当前代码更接近 COS，改动更小 |
| 阿里云 | 香港 ECS，`cn-hongkong` | 香港 OSS bucket，endpoint `oss-cn-hongkong.aliyuncs.com` | 香港 RDS PostgreSQL | 从零开也可行 |

香港路线边界：

- 如果 Web 接入、对象存储、数据库都在香港，通常不需要大陆 ICP。
- 国内用户可以访问香港 HTTPS / PWA。
- 但香港到国内是跨境链路，视频上传和下载可能比大陆机房慢，也可能受运营商/地区/时段影响。
- 香港路线不能顺手解决大陆 CDN 加速。只要用了中国大陆 CDN 节点，通常又会回到 ICP 问题。
- 如果目标是减少 ICP 复杂度，不要把香港服务器和大陆对象存储 / 大陆 CDN 混搭。

当前香港云厂商判断，作为历史备选保留：

- 如果沿用当前 COS 代码链路，香港也优先腾讯云，少改存储适配。
- 如果愿意做 OSS 适配，阿里云香港也完全可行。

## 7. 国内化迁移 worktree 当前状态

不要继续追真实 e2e。这个 worktree 当前是“资源未买好，所以暂停”的状态。

worktree 路径：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

分支：

```text
codex/domestic-infra-migration
```

最新提交：

```text
cdc5ca1 docs: add domestic offline deployment readiness kit
```

已核对状态：

```text
git status --short
# 干净
```

long-task 状态：

```text
.codex/long-task/active.json
status: blocked
taskId: domestic-infra-migration
completionPromise: DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

不要标记 project long-task complete。

真实资源到位之前，不要做这些事：

```text
不要 merge。
不要 push。
不要切 ba-ba-ke.com。
不要由 AI 点击 ICP / 采购 / 协议确认类最终提交按钮。
不要写 DOMESTIC_PHASE1_E2E_PASS。
不要标记 project long-task complete。
不要声称 domestic phase1 e2e 已通过。
```

## 8. 国内化迁移分支已经做了什么

另一个执行国内化迁移的窗口汇报过：

```text
已完成 resource-independent / offline hardening。
分支：codex/domestic-infra-migration
最新提交：cdc5ca1 docs: add domestic offline deployment readiness kit
git status --short：干净
project long-task：仍是 blocked，未 complete
未 merge、未 push、未切 ba-ba-ke.com、未做 ICP、未写完成 marker。
```

这个 worktree 里的重点文件：

```text
deploy/domestic/README.md
docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md
docs/progress/2026-05-14-domestic-resource-independent-hardening.md
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md
```

已汇报通过的本地验证：

```text
pnpm typecheck
pnpm lint
pnpm build
worker 50 tests OK
worker compileall
Docker compose config
部署模板校验
app/COS/API/worker missing-env 失败路径
PostgreSQL baseline/seed 本地验证
本地 login
test draft
media complete
video job create
source item read API
mixed Supabase/Postgres env 优先级
app env preflight
API smoke
worker env-file smoke
```

仍然阻塞的原因：

```text
目标服务器还没买好
目标 PostgreSQL 还没买好
目标阿里云 OSS bucket 和 CORS 还没配好
手机端 IP 访问验证环境还没有
真实 provider key / 测试账号 / env 文件还没有
```

## 9. 资源买好后再怎么继续

用户后面会带回来这些信息中的一部分或全部：

```text
服务器 IP
服务器 SSH 用户 / 登录方式
服务器地域
PostgreSQL 连接串
PostgreSQL SSL mode
OSS bucket
OSS region
OSS CORS origin
Secret ID / key，只能放本地 env，不能提交
测试 owner email
临时密码
provider keys
手机测试设备 / 浏览器
```

不要把任何密钥、密码、provider key 写进提交文档。

资源到位后，从这两份 worktree 文档继续：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
```

资源到位后的第一批命令：

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
node app/scripts/check-domestic-app-env.mjs --env-file /etc/jingjing/app.env --require-video-chain-test-entrypoint
node app/scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env
```

然后再做：

```text
服务器 bootstrap
app smoke
worker smoke
手机端真实 e2e
```

真实 e2e 通过标准：

```text
手机浏览器能打开目标 IP / 域名。
用户能登录。
用户能创建 / 上传素材。
素材字节落到目标 OSS。
API 能创建 video job。
worker 能领取 job。
OpenStoryline / FireRed 成功返回。
final.mp4、cover、subtitles 上传到目标 OSS。
数据库记录 succeeded job 和 asset_objects。
页面能重新签名并下载 final.mp4。
progress 文档里有证据记录。
```

只有这些都过了，才考虑 completion marker / long-task complete。

## 10. 2026-05-15 最新补充：统一阿里云与合规清单

用户已确认：

```text
公司有阿里云企业账号。
正式国内资源统一走阿里云。
周末先不等企业账号采购，用现有新加坡 2 核 4G 服务器自建 PostgreSQL，先跑通 Supabase + Vercel 替换。
下周一用公司阿里云企业账号采购国内 ECS / RDS PostgreSQL / OSS，并同步启动 ICP。
```

当前推荐采购：

```text
阿里云 ECS：8 核 16G，Ubuntu 22.04，100G 系统盘
阿里云 RDS PostgreSQL：基础系列 2 核 4G + 100GB，约 ¥168/月；后续再升级高可用
阿里云 OSS：100GB/月资源包或按量起步
```

早期预算口径：

```text
ECS 约 ¥793.64/月
RDS PostgreSQL 基础系列约 ¥168/月
OSS 100GB/月资源包约 ¥11/月
合计约 ¥972.64/月 + 公网流量 / 请求量 / 备份超额等小项
```

合规事项已补进：

```text
docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md
docs/handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
```

正式对外收集用户自拍视频、图片素材、声音音频和声音克隆音色前，需要准备：

```text
ICP 备案
公安联网备案
算法 / 深度合成备案材料
《隐私政策》
《用户服务协议》
《声音克隆授权协议》
《AI合成内容使用规则》
《用户素材授权与肖像/声音承诺》
个人信息处理清单
第三方共享清单
个人信息保护影响评估记录
```

注意：

- 视频、图片、声音音频、成片放 OSS。
- PostgreSQL 只保存 bucket、object key、归属关系、授权记录、任务状态、AI 结果元信息。
- 周末新加坡自建 PostgreSQL rehearsal 不接真实敏感用户数据。
- Agent 可以协助整理材料和迁移验证，但不要替用户点击备案 / 采购 / 协议确认类最终提交按钮。

## 11. 新窗口可以直接复制的提示词

用户新开 Codex 窗口后，可以直接复制这一段：

```text
请继续读取：
docs/handoff/2026-05-14-server-purchase-domestic-migration-zero-memory-handoff.md

我们现在要继续两件事：

第一件事：继续国内化迁移和阿里云采购准备。
最新决策已经明确：ba-ba-ke.com 是国内公司主体，正式国内资源统一走阿里云。
周末先用现有新加坡 2 核 4G 服务器自建 PostgreSQL，跑通 Supabase + Vercel 替换 rehearsal，不接真实敏感用户数据。
下周一用公司阿里云企业账号采购 ECS 8核16G + RDS PostgreSQL 基础系列 + OSS，并同步启动 ICP。

第二件事：资源买好后，再恢复国内化代码改造 worktree 做真实资源验证。

在我明确说资源已经买好之前，不要动这个 worktree：
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration

这个 worktree 当前应保持：
分支 codex/domestic-infra-migration
commit cdc5ca1 docs: add domestic offline deployment readiness kit
git status 干净
long-task blocked，不能 complete

不要 merge。
不要 push。
不要切 ba-ba-ke.com。
不要由 AI 点击 ICP / 采购 / 协议确认类最终提交按钮。
不要写 DOMESTIC_PHASE1_E2E_PASS。
不要在真实资源和真实手机端 e2e 通过前，声称国内 phase1 完成。
```
