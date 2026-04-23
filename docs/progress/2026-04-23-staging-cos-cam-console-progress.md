# 2026-04-23 Staging COS / CAM 控制台实际操作记录

## 背景

本记录只描述 2026-04-23 在腾讯云控制台里已经真实完成的 `COS + CAM` 外部配置动作。

这不是代码集成记录，也不是完整联调结论。目标是把“已经点过什么、现在停在什么位置、下次该从哪继续”记录清楚，避免后续继续操作时依赖聊天记忆。

## 已完成

### 1. COS 桶已创建

已在腾讯云 COS 控制台创建 staging 私有桶：

- APPID：`1341668543`
- 地域：`ap-singapore`
- 完整桶名：`jj-content-staging-1341668543`
- 访问权限：`私有读写`

补充说明：

- 原方案文档里的逻辑桶名是 `jingjing-content-staging`
- 但在腾讯云实际落地时，若按 `jingjing-content-staging-<APPID>` 生成完整桶名，会超出控制台允许的主机名长度
- 因此这次真实创建时改用了更短的实际前缀 `jj-content-staging`

### 2. COS CORS 已配置

已在 `jj-content-staging-1341668543` 上保存跨域规则，实际值如下：

- Origin：
  - `http://localhost:3000`
  - `https://jingjing-content-platform-staging.vercel.app`
  - `https://*.vercel.app`
- Methods：
  - `PUT`
  - `GET`
  - `POST`
  - `HEAD`
- Allowed Headers：`*`
- Expose Headers：
  - `ETag`
  - `Content-Length`
- Max Age：`600`
- Response Vary：已开启

### 3. CAM 子账号已创建

已在腾讯云 CAM 中创建 staging 专用子账号：

- 用户名：`staging-cos-video-worker`
- 访问方式：`编程访问`
- 控制台访问：未开启
- 子账号 UIN：`100048364578`
- 子账号 UID：`24988130`

## 尚未完成

以下动作在本次暂停前还没有做完：

1. 还没有创建自定义 COS 策略
2. 还没有把自定义策略绑定到 `staging-cos-video-worker`
3. 还没有把 `COS_SECRET_ID / COS_SECRET_KEY` 等变量填到 Vercel staging
4. 还没有跑 Supabase migration
5. 还没有把 `workers/video-worker/**` 部署到轻量服务器
6. 还没有做 staging smoke test

## 敏感信息处理

本次在 CAM 创建子账号时，腾讯云成功页展示过一次性的 `SecretId / SecretKey`。

当前约束：

- 仓库里没有保存任何密钥明文
- 聊天记录里也不应再次回显这些值
- 下一次继续前，应先确认这两个值已经被安全保存到密码管理器或其他安全记录中

## 已知偏差

当前仓库里的 `Runbook` 仍以原计划桶名为基线：

- 逻辑桶名：`jingjing-content-staging`
- 完整桶名格式：`jingjing-content-staging-<APPID>`

但本次真实创建的桶是：

- `jj-content-staging-1341668543`

这意味着后续继续配置前，必须以“真实已创建桶”为准，尤其是：

- CAM 策略资源字符串
- Vercel `COS_BUCKET`
- Worker `.env`
- 后续 smoke test 的检查目标

## 下一步建议

建议后续按这个顺序继续：

1. 先确认子账号 `SecretId / SecretKey` 已安全保存
2. 在 CAM 中创建自定义 COS 策略
3. 把策略绑定到 `staging-cos-video-worker`
4. 再去补 Vercel staging 环境变量
5. 再去轻量服务器部署 `workers/video-worker`
6. 最后按 smoke checklist 联调

## 验证方式

本记录对应的是“真实浏览器 + 真实腾讯云控制台”操作结果，不是基于文档假设。

本次已实际确认：

- COS 桶存在
- COS CORS 已保存
- CAM 子账号创建成功

本次未验证：

- 自定义策略创建
- 策略绑定
- Vercel / Supabase / Worker 联调
