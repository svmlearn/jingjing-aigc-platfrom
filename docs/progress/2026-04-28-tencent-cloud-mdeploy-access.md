# 2026-04-28 腾讯云 M 同学部署与 COS 排查账号记录

## 目的

为 M 同学补齐 staging worker 部署与腾讯云 COS 排查所需访问入口。

本记录用于直接转交给 M 同学，包含访问入口和操作步骤。

注意：临时密码不要写入 Git、PR、issue 或普通文档。需要交接时应通过私下渠道发送，或现场重置后让 M 同学首次登录立即改密。

## 腾讯云 CAM 子用户

- 用户名：`m-staging-deployer`
- 登录链接：`https://cloud.tencent.com/login/subAccount/100040753217?type=subAccount&username=m-staging-deployer`
- 临时密码：不入库，通过私下渠道发送或现场重置
- 访问方式：腾讯云控制台访问
- 编程访问：未开启，`SecretId / SecretKey` 均未生成
- 首次登录：创建时设置为下次登录必须重置密码
- 关联策略：
  - `jj-content-staging-media-rw`
  - `QcloudLighthouseFullAccess`

用途：

- 登录腾讯云控制台查看轻量服务器 `openstoryline-test-sg`
- 查看和排查 staging COS 媒体桶相关问题
- 通过轻量服务器控制台入口辅助登录或排查 worker 服务

### 给 M 同学的腾讯云登录步骤

1. 打开登录链接：

   `https://cloud.tencent.com/login/subAccount/100040753217?type=subAccount&username=m-staging-deployer`

2. 用户名一般会自动带上。如果没有自动带上，就填：

   `m-staging-deployer`

3. 密码填：私下渠道收到的临时密码，或由 W 同学现场重置后的临时密码。

4. 第一次登录会要求重置密码，按页面提示改成你自己的密码。

5. 如果页面要求绑定手机号、微信或 MFA，按页面提示完成。这个是腾讯云的安全校验。

6. 登录后常用入口：

   - 看服务器：搜索或进入 `轻量应用服务器`，找到 `openstoryline-test-sg`
   - 看 COS：搜索或进入 `对象存储 COS`，查看 staging 媒体桶相关文件

7. 不要新建或导出 API 密钥。当前这个账号没有开 `SecretId / SecretKey`，主要是给你进控制台看问题和排查服务器用。

## 服务器 Linux 用户

- 服务器：`openstoryline-test-sg`
- 公网 IP：`43.160.208.189`
- 实例 ID：`lhins-pw7pptl9`
- 系统：Ubuntu Server 24.04 LTS 64bit
- 用户名：`mdeploy`
- 临时密码：不入库，通过私下渠道发送或现场重置
- 分组：
  - `sudo`
  - `docker`
  - `jingjing-deploy`

已调整 `/srv/jingjing-video-worker` 为 `jingjing-deploy` 组可协作目录，并保留目录 setgid，方便后续上传/同步 worker 文件后仍保持组权限。

### 给 M 同学的服务器登录步骤

如果你用 Mac：

1. 打开「终端」。
2. 输入：

   ```bash
   ssh mdeploy@43.160.208.189
   ```

3. 如果第一次连接时出现类似 `Are you sure you want to continue connecting`，输入：

   ```bash
   yes
   ```

4. 输入私下渠道收到的临时密码，或由 W 同学现场重置后的临时密码。

5. 第一次登录会要求你改密码。通常会先让你输入当前密码，再输入两次新密码。

如果你用 Windows：

1. 打开 PowerShell。
2. 输入同一条命令：

   ```bash
   ssh mdeploy@43.160.208.189
   ```

3. 后续步骤和 Mac 一样。

登录成功后，进入 worker 目录：

```bash
cd /srv/jingjing-video-worker
```

查看 worker 是否在运行：

```bash
docker compose ps
```

看 worker 日志：

```bash
docker compose logs -f video-worker
```

看 OpenStoryline 引擎日志：

```bash
docker compose logs -f openstoryline-engine
```

重启 worker：

```bash
docker compose restart video-worker
```

如果你要把本地代码传到服务器，先在你自己电脑的项目根目录执行：

```bash
rsync -av --delete workers/video-worker/ mdeploy@43.160.208.189:/srv/jingjing-video-worker/
```

上传完成后，再登录服务器执行：

```bash
cd /srv/jingjing-video-worker
docker compose up -d --build
docker compose ps
```

注意：不要把 `/srv/jingjing-video-worker/.env` 拷回本地，也不要把里面的密钥发到聊天里。

## 验证结果

已通过现有 `ubuntu` SSH 登录服务器后验证：

- `mdeploy` 用户存在
- `mdeploy` 属于 `sudo`、`docker`、`jingjing-deploy`
- `mdeploy` 可进入 `/srv/jingjing-video-worker`
- `mdeploy` 可读取 `/srv/jingjing-video-worker/.env`
- `mdeploy` 可写 `/srv/jingjing-video-worker`
- `mdeploy` 可执行 `docker compose ps`
- 当前容器状态：
  - `openstoryline-engine`：运行中，healthy
  - `video-worker`：运行中

## 安全备注

- 本文档不包含腾讯云子账号临时密码和服务器临时密码。
- 两个密码都建议通过私下渠道发送或现场重置，并在首次使用后立即改掉。
- 建议 M 同学首次登录后立即改密，并尽快补自己的 SSH public key，后续再切回 SSH key 登录方式。
- 不要把 Supabase 连接串、COS Secret、OpenAI API Key 或 `.env` 内容贴到聊天、PR、issue 或普通文档里。
