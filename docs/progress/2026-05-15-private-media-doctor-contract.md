# 2026-05-15 私有素材与个人声音 doctor 合同

## 目标

把 `01-依据与全局硬门禁.md` 和 `03-商家团队素材库与标签.md` 中的高风险上线门禁转成可重复的本地 doctor 合同，先用 fixture 验证检查逻辑，后续再接真实 DB / COS / provider 状态。

## 已完成

- 新增 doctor 模块：
  - `app/src/lib/private-media-doctor.ts`
- 新增测试：
  - `app/src/lib/private-media-doctor.test.ts`
- 检查项覆盖：
  - ready asset 没有 ready clip。
  - 用户端 / 成员端临时素材或 voice_profile 来源误入 `merchant_media_*`。
  - ready clip 缺缩略图。
  - ready clip 缺 COS key。
  - 低置信度 ready clip。
  - V1 下同一 asset 多条 ready clip。
  - `clip_index != 0`。
  - full_video 边界不是 `0 -> duration_seconds`。
  - 超长 full_video 仍 ready。
  - 同一 `merchant_id + created_by_user_id` 存在多个 ready voice profile。
  - public bucket 阻断。
  - `SUPABASE_SERVICE_ROLE_KEY` / `COS_SECRET_*` 暴露到客户端运行时阻断。
  - 过期 pending upload intent 阻断。
  - orphan COS object 阻断。
  - ready clip 指向的 COS 对象 / 缩略图对象不存在阻断。
  - provider cleanup job 积压阻断。

## 验证

已执行：

```powershell
cd app
node --test src/lib/private-media-doctor.test.ts src/lib/merchant-media-repository-contract.test.ts src/lib/media-processing-contract.test.ts src/lib/voice-profile-state-machine.test.ts
./node_modules/.bin/tsc --noEmit
```

- 追加执行：

```powershell
cd app
node --test src/lib/private-media-doctor.test.ts src/lib/private-media-workflow-fixture.test.ts
```

结果：

- doctor focused tests：`5` passed。
- doctor + workflow fixture tests：`6` passed。
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- Doctor 输入：纯 fixture。
- COS 对象存在性：本切片用 injected `existingCosKeys` fixture 做等价检查，未查真实 bucket。
- public bucket：本切片用 injected `publicBuckets` fixture 做等价检查，未访问真实 COS ACL。
- service role / server secret 泄漏：本切片用 injected `clientExposedEnvKeys` fixture 做等价检查，未扫描真实 bundle。
- pending upload / orphan cleanup：本切片用 injected pending / orphan fixture 做等价检查，未接真实 upload_intents 表。
- DB：未接真实 repository。
- Voice provider：本切片用 injected cleanup job fixture 做等价检查，未查真实 RunningHub cleanup 队列。

## 后续

- 接真实 repository / COS / deployment 后，应把 injected fixture 输入替换成真实 DB、COS ACL、object exists、bundle/env scan 和 provider cleanup queue。
- 当前 doctor 是本轮允许的“fixture/local 等价检查”，不代表 staging 真实环境已无阻断项；真实环境 smoke 记录为后续。
