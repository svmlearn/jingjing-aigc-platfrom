# 2026-04-23 staging COS / CAM 控制台操作 Handoff

## 1. 当前目标

在真实腾讯云控制台里完成 staging 的 `COS + CAM` 基础设施配置，为后续 `Vercel + Supabase + Video Worker` 联调做准备。

这轮目标原本包括：

1. 创建 staging COS 私有桶
2. 配置 CORS
3. 创建 staging 专用 CAM 子账号
4. 创建并绑定最小权限自定义策略

本轮在第 1、2、3 步已经完成后暂停，第 4 步还未完成。

## 2. 本轮已完成

### 2.1 COS

已真实创建 COS 桶：

- APPID：`1341668543`
- 地域：`ap-singapore`
- 完整桶名：`jj-content-staging-1341668543`
- 访问权限：`私有读写`

已真实配置并保存 CORS：

- `http://localhost:3000`
- `https://jingjing-content-platform-staging.vercel.app`
- `https://*.vercel.app`
- 方法：`PUT / GET / POST / HEAD`
- `Allowed Headers = *`
- `Expose Headers = ETag, Content-Length`
- `Max Age = 600`
- `Response Vary = 开启`

### 2.2 CAM

已真实创建 CAM 子账号：

- 用户名：`staging-cos-video-worker`
- 访问方式：`编程访问`
- 控制台访问：未开启
- 子账号 UIN：`100048364578`
- 子账号 UID：`24988130`

## 3. 本轮未完成

仍待完成：

1. 创建自定义策略
2. 把策略绑定到 `staging-cos-video-worker`
3. 把真实 COS 信息同步到 Vercel / Worker 配置

## 4. 关键事实

### 4.1 真实桶名与原方案不一致

原先文档里的逻辑命名是：

- `jingjing-content-staging`

但真实控制台里，这个前缀加上 `-1341668543` 后会超出腾讯云允许的完整桶名长度，所以本次已实际落地为：

- `jj-content-staging-1341668543`

后续一切真实配置都必须以这个桶名为准，不要再按旧文档里的完整桶名直接照抄。

### 4.2 密钥没有落仓库

子账号创建成功页展示过一次性的 `SecretId / SecretKey`，但：

- 没有写入仓库
- 不应写进 handoff
- 不应在后续聊天里明文回显

下一位继续前，必须先确认用户已经安全保存了这两个值。

## 5. 下一步建议

下一位接手时，建议严格按这个顺序继续：

1. 先确认 `staging-cos-video-worker` 的 `SecretId / SecretKey` 已保存
2. 到 `CAM -> 策略 -> 新建自定义策略`
3. 以真实桶名 `jj-content-staging-1341668543` 创建最小权限 COS 策略
4. 再把该策略绑定到 `staging-cos-video-worker`
5. 完成后再继续 Vercel staging 环境变量配置

建议使用的策略名：

- `jj-content-staging-media-rw`

策略资源字符串应以真实桶名为准：

```text
qcs::cos:ap-singapore:uid/1341668543:jj-content-staging-1341668543/*
```

## 6. 改动文件

本轮为了留痕，新增：

- `docs/progress/2026-04-23-staging-cos-cam-console-progress.md`
- `docs/handoff/2026-04-23-staging-cos-cam-console-handoff.md`

本轮没有改任何代码文件。

## 7. 验证结果

本轮是“真实外部控制台操作”，不是本地代码验证。

已真实验证：

- COS 桶创建成功
- COS CORS 保存成功
- CAM 子账号创建成功

未验证：

- 自定义策略创建成功
- 策略绑定成功
- Vercel / Worker / Supabase 联调

## 8. 当前分支 / commit / push / merge

- 当前目录：主工作区
- 当前分支：`main`
- 本轮未创建 commit
- 本轮未 push
- 本轮未 merge

如果后续要把这轮操作继续推进到“可联调”，建议在完成 CAM 策略绑定后，再补一份新的 `docs/progress/` 执行记录。
