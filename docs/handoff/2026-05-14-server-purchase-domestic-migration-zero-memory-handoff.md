# 2026-05-14 服务器采购与国内化迁移零上下文交接

## 1. 这份文档是干嘛的

这份 handoff 是给新窗口 / 新 Agent 看的，目标是不用翻聊天记录，也能继续接上两件事：

1. 下一套云资源到底怎么买：大陆还是香港，腾讯云还是阿里云。
2. `codex/domestic-infra-migration` 这个国内化代码改造 worktree 现在停在哪个断点。

当前用户目标：

```text
先决定下一套验证环境走大陆还是香港。
再决定腾讯云还是阿里云。
然后购买服务器 + 对象存储 + PostgreSQL。
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

现在还没有最终决定走大陆还是香港。

正确决策顺序是：

```text
1. 先决定：大陆路线 vs 香港路线。
2. 再决定：腾讯云 vs 阿里云。
3. 再买：同一家云、同一区域或近区域的一整套资源。
4. 资源买完后，才恢复国内化迁移 worktree 的真实资源验证。
```

如果域名主体、公司主体、ICP备案路径还没确认，不要直接进入购买。

## 4. 域名 / ICP / 公司主体还要确认什么

明天用户会给结论，目前待确认：

```text
域名：ba-ba-ke.com
未知：这个域名是不是已经挂在老板香港公司名下。
未知：这个域名能不能转到国内公司主体。
已知：大概率有一个国内正规公司可以做 ICP 备案，只要域名和云账号主体能配合。
```

明天要问清 / 记录清楚：

1. `ba-ba-ke.com` 当前域名持有人 / 实名主体是谁。
2. 它是不是已经挂在香港公司名下。
3. 它能不能转到国内公司主体。
4. 如果不能转，用户是否愿意新买一个域名给国内公司备案。
5. 国内公司是否能统一承担：云账号实名、域名实名、ICP备案、服务器、对象存储、数据库。

决策规则：

| 情况 | 优先路线 |
| --- | --- |
| 国内公司能持有/实名域名，并且能做 ICP | 大陆服务器 + 大陆对象存储 + 大陆 PostgreSQL |
| `ba-ba-ke.com` 卡在香港公司，且用户不想换域名 | 香港服务器 + 香港对象存储 + 香港 PostgreSQL |
| 只是 phase1 技术验证 | 可以先用服务器 IP 验证，不被域名/ICP/HTTPS 卡住 |
| 最终要给国内房产中介长期稳定使用 | 如果 ICP 可行，优先大陆路线 |

## 5. 大陆路线怎么走

适用前提：国内公司、域名、ICP备案这条路能走通。

推荐形态：

```text
国内公司实名云账号
-> 大陆服务器
-> 大陆 PostgreSQL
-> 大陆 COS/OSS bucket
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

- 如果继续用腾讯 COS / 腾讯 PostgreSQL，腾讯云更省心，因为当前代码和 COS 链路更接近。
- 如果从零重新开一套、优先考虑价格，阿里云更便宜。
- 不建议服务器在阿里云、对象存储在腾讯云、数据库又在第三家。短期能跑，长期排障会烦。

## 6. 香港路线怎么走

适用前提：`ba-ba-ke.com` 卡在香港公司名下，且用户想先快速试运营，不想等大陆 ICP。

推荐形态：

```text
香港服务器
-> 香港 PostgreSQL
-> 香港 COS/OSS bucket
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

当前香港云厂商判断：

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
不要做 ICP。
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
目标 COS/OSS bucket 和 CORS 还没配好
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
COS/OSS bucket
COS/OSS region
COS/OSS CORS origin
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
素材字节落到目标 COS/OSS。
API 能创建 video job。
worker 能领取 job。
OpenStoryline / FireRed 成功返回。
final.mp4、cover、subtitles 上传到目标 COS/OSS。
数据库记录 succeeded job 和 asset_objects。
页面能重新签名并下载 final.mp4。
progress 文档里有证据记录。
```

只有这些都过了，才考虑 completion marker / long-task complete。

## 10. 新窗口可以直接复制的提示词

用户新开 Codex 窗口后，可以直接复制这一段：

```text
请继续读取：
docs/handoff/2026-05-14-server-purchase-domestic-migration-zero-memory-handoff.md

我们现在要继续两件事：

第一件事：决定下一套服务器和云资源路线。
先根据 ba-ba-ke.com 的域名主体、是否能转国内公司、是否能用国内公司做 ICP，判断走大陆部署还是香港部署。
然后再判断腾讯云还是阿里云。

第二件事：后面资源买好后，再恢复国内化代码改造 worktree。

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
不要做 ICP。
不要写 DOMESTIC_PHASE1_E2E_PASS。
不要在真实资源和真实手机端 e2e 通过前，声称国内 phase1 完成。
```
