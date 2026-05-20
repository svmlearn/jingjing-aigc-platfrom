# 2026-05-19 阿里云 ECS SSH 运维访问配置记录

## 背景

用户希望让其他 AI 工具和研发同学可以通过 SSH 访问阿里云 ECS，接管后续运维、部署、服务重启和问题排查。

说明：

- RAM 负责阿里云控制台 / OpenAPI 权限。
- SSH 服务器登录权限由 ECS 操作系统用户、SSH 公钥和 sudo 权限控制。
- 本次只配置 SSH 侧运维账号，不创建 RAM AccessKey，不打印或记录任何私钥。

## 服务器

```text
ECS 公网 IP: 8.154.28.41
默认登录用户: ubuntu
新增运维用户: aiops
运维组: jingjing-ops
```

## 已完成

已在 ECS 上创建：

```text
group: jingjing-ops
user: aiops
```

`aiops` 权限：

```text
groups: aiops, sudo, jingjing-ops
sudo: %jingjing-ops ALL=(ALL) NOPASSWD:ALL
ssh: 使用当前 ubuntu 登录公钥复制到 /home/aiops/.ssh/authorized_keys
```

用途：

- 本机其他 AI 工具可以使用当前本机 SSH 私钥登录：

```bash
ssh aiops@8.154.28.41
```

- 登录后可执行部署、查看日志、重启服务等操作。

## 验证结果

已验证：

```text
ssh aiops@8.154.28.41: pass
sudo -n true: pass
readlink -f /srv/jingjing-domestic/current: pass
```

关键服务状态：

```text
nginx: active
jingjing-domestic-app.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

## 研发同学接入方式

不要共享当前私钥。

让研发同学在自己的电脑生成 SSH key，并只提供 `.pub` 公钥内容：

```bash
ssh-keygen -t ed25519 -C "jingjing-devops-<name>-20260519"
cat ~/.ssh/id_ed25519.pub
```

拿到公钥后，建议为研发同学创建独立 Linux 用户，例如：

```text
username: meng
group: jingjing-ops
```

再把他的 `.pub` 写入：

```text
/home/<username>/.ssh/authorized_keys
```

这样后续可以单独收回某位研发或某个 AI 工具的 SSH 权限。

### 2026-05-19 已新增研发账号

已新增研发同学 SSH 账号：

```text
username: meng
groups: meng, sudo, jingjing-ops
ssh key fingerprint: SHA256:gwH0eob71fV6yqF8vc4S4jxDsxR5i7NyQeDl37+PZ10
```

登录命令：

```bash
ssh meng@8.154.28.41
```

说明：只记录公钥指纹，不在文档中长期保存完整公钥。

## 后续安全建议

当前 SSH 配置检查结果：

```text
PubkeyAuthentication: yes
PasswordAuthentication: no
PermitRootLogin: yes
```

建议在确认没有流程依赖 root 直连后，将 root SSH 登录改为禁止或至少禁止密码登录。此项本次未改动，避免影响现有服务器访问。
