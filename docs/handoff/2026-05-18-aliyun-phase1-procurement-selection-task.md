# 2026-05-18 Aliyun Phase 1 Procurement Selection Task

## 1. Goal

Use the company Aliyun enterprise account to finalize, but not purchase, the first-month domestic Phase 1 resource selection:

```text
ECS + RDS PostgreSQL + OSS
```

This is a purchasing research / console selection task. Do not click final purchase / pay / submit order.

The output should be a concrete shopping checklist that the product owner can follow and manually place the order.

## 2. Must-Read Local Context

Read:

```text
docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
docs/handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md
docs/progress/2026-05-18-real-aliyun-oss-validation.md
docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
```

Important current facts:

```text
ba-ba-ke.com 的域名主体确认为星阅科技。
域名管理账号挂在个人账号下。
计划用阿里云企业账号采购 ECS/RDS/OSS，并后续通过阿里云做 ICP 备案。
当前要先买 1 个月资源做技术验证，不直接提交 ICP。
真实 Aliyun OSS roundtrip 当前被缺少 ALIYUN_OSS_* env 阻塞。
```

## 3. Domain / ICP Rule To Record

Use Aliyun official docs as the final source of truth.

Current interpretation:

```text
域名“管理账号”在个人账号下，不等于域名“实名认证主体”是个人。
ICP 关键核验项是域名实名认证信息是否与备案主体信息一致。
如果 ba-ba-ke.com 的域名持有者/证件信息确实是星阅科技，并且与阿里云企业账号要备案的主体一致，则个人账号管理不应成为硬阻塞。
如果域名实名信息仍是个人或证件信息不一致，需要先做域名实名信息变更/过户/模板修正，再提交 ICP。
```

Before final recommendation, verify and record:

```text
domain registrant name
registrant certificate type / number, if visible without exposing sensitive data
whether it matches 星阅科技备案主体
DNS control availability
whether the domain registrar is approved for ICP domain verification
```

Do not print or commit certificate numbers; redact them.

Official Aliyun references to use:

- 域名实名认证信息与备案主体信息不一致处理: https://help.aliyun.com/zh/icp-filing/how-to-deal-with-the-inconsistency-between-the-domain-name-real-name-authentication-information-and-the-filing-subject-information
- 域名与服务器不同服务商备案: https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/domain-name-and-how-the-server-is-not-in-the-same-service-provider-for-the-record
- 备案前服务器及接入信息检查: https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check

## 4. Purchase Principle

For this task:

```text
buy duration target: 1 month
purpose: technical validation by IP / temporary URL
not purpose: formal ICP submission
```

Important:

```text
Aliyun ICP备案用 ECS 通常要求中国内地节点、包年包月、购买时长 3 个月及以上并有公网带宽。
Therefore, a 1-month ECS is acceptable for Phase 1 technical validation, but may not satisfy ICP filing requirements.
If product owner wants to start ICP immediately with this server, prepare a separate 3-month option and clearly mark the higher cost.
```

## 5. Recommended Baseline To Compare In Console

### 5.1 ECS

Baseline:

```text
Region: 华东1（杭州）优先，或与 OSS/RDS 同地域
Billing: 包年包月
Duration: 1 个月
Instance: 8 vCPU / 16 GiB
Candidate family: ecs.c9i.2xlarge or current equivalent
Image: Ubuntu 22.04 LTS 64-bit
System disk: ESSD PL0 100 GiB
Data disk: compare no data disk vs 200-300 GiB ESSD PL0
Public IPv4: enabled
Bandwidth billing: 按使用流量
Bandwidth peak: 5 Mbps baseline; compare 10 Mbps if price impact is small
Security group: 22, 80, 443, ICMP
SSH source: if possible restrict 22 to trusted IP after purchase
Auto-renew: off
Login: create/reset after purchase; do not record password in docs
Name: jingjing-domestic-phase1
```

Decision rule:

```text
If 8C16G c9i is available at reasonable one-month price, select it.
If not available or price is unexpectedly high, compare latest general/compute instance with same 8C16G.
Do not downshift below 8C16G unless product owner explicitly chooses budget mode.
```

### 5.2 RDS PostgreSQL

Baseline:

```text
Region/VPC: same as ECS
Engine: PostgreSQL
Version: latest stable supported by Aliyun that is compatible with app; prefer 16/17 if available
Edition: Basic / single-zone for Phase 1 validation
Spec: 2 vCPU / 4 GiB
Storage: 100 GiB
Billing: 1 month if available
Public access: off
Network: private/VPC only
Whitelist/security: ECS private IP / VPC only
Backups: default; record extra backup cost if shown
```

Also check:

```sql
select version();
select * from pg_available_extensions where name = 'vector';
```

Do not require pgvector for Phase 1; current code has embedding_json / lexical fallback.

### 5.3 OSS

Baseline:

```text
Region: same as ECS/RDS if possible
Bucket ACL: private
Storage class: Standard
Redundancy: LRS / 本地冗余 for Phase 1
Billing: pay-as-you-go or 100GB monthly resource package, whichever is clearer/cheaper for one-month validation
Public access: disabled
Versioning: off for Phase 1 unless console strongly recommends otherwise
Server-side encryption: record option/cost; enable only if simple and no app change
```

Bucket name:

```text
lowercase letters / digits / hyphen only
globally unique
do not include secrets
suggestion: jingjing-domestic-phase1-<short-company-or-random-suffix>
```

CORS for signed PUT validation:

```text
Allowed origins:
- local validation origin if used
- http://43.160.208.189 if Singapore rehearsal will test against it
- future app.ba-ba-ke.com after ICP/domain cutover

Allowed methods:
- PUT
- GET
- HEAD

Allowed headers:
- Content-Type
- or *

Expose headers:
- ETag
- x-oss-request-id
```

RAM permissions for app validation:

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta if needed
```

Prefix scope:

```text
app-storage-provider-smoke/*
source-assets/*
draft-inputs/*
knowledge/*
```

## 6. What To Do In Browser / Console

Use the Aliyun console to inspect current available options and prices.

Do:

```text
1. Open ECS custom purchase page and reproduce the 1-month 8C16G option.
2. Record exact instance family/spec, region, disk, bandwidth, and price.
3. Open RDS PostgreSQL purchase page and record exact 2C4G/100GB basic price.
4. Open OSS product/resource package page and record 100GB/month or pay-as-you-go recommendation.
5. Check whether the current account is enterprise real-name under 星阅科技.
6. Check whether the domain ba-ba-ke.com real-name holder matches the filing subject.
7. Stop before final checkout/payment.
```

Do not:

```text
click purchase/pay/submit order
change DNS records
submit ICP application
create public bucket
paste or print secrets
```

## 7. Expected Output

Write:

```text
docs/progress/2026-05-18-aliyun-phase1-procurement-selection.md
docs/handoff/2026-05-18-aliyun-phase1-procurement-selection-handoff.md
```

Include:

```text
Recommended final ECS selection
Recommended final RDS PostgreSQL selection
Recommended final OSS selection
One-month estimated cost
Optional 3-month ICP-ready cost if visible
Domain/ICP risk conclusion
Exact next purchase steps for product owner
Screenshots or copied console summary if safe and no secrets
No secrets / no payment confirmation
```

## 8. Completion Conditions

This task is complete when:

```text
ECS/RDS/OSS one-month choices are concrete enough for manual checkout
domain/ICP mismatch risk is classified
OSS env values needed for Batch 9B-V are listed, without secrets
no purchase was made by the Agent
no secrets were committed
handoff/progress docs are committed
worktree clean
no main merge
no completion marker
```

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

