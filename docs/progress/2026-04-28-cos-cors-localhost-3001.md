# 2026-04-28 COS CORS 补充 localhost:3001

## 背景

M 同学本地联调时使用 `http://localhost:3001`，但 staging COS 桶原有 CORS 只放行了：

- `http://localhost:3000`
- `https://jingjing-content-platform-staging.vercel.app`
- `https://*.vercel.app`

这会导致本地 `3001` 端口访问 COS 直传或读取相关请求时被浏览器 CORS 拦截。

## 操作对象

- COS Bucket：`jj-content-staging-1341668543`
- Region：`ap-singapore`
- 控制台路径：`对象存储 COS -> 存储桶列表 -> jj-content-staging-1341668543 -> 安全管理 -> 跨域访问 CORS 设置`

## 已保存配置

当前 CORS 规则已更新为：

- Origin：
  - `http://localhost:3000`
  - `http://localhost:3001`
  - `https://jingjing-content-platform-staging.vercel.app`
  - `https://*.vercel.app`
- Methods：
  - `PUT`
  - `GET`
  - `POST`
  - `HEAD`
- Allow-Headers：`*`
- Expose-Headers：
  - `ETag`
  - `Content-Length`
  - `x-cos-request-id`
- Max-Age：`600`
- Vary：已开启

说明：保留了原有 `Content-Length`，同时补充 `x-cos-request-id`。

## 验证结果

已用 `OPTIONS` 预检验证 `http://localhost:3001`：

```bash
curl -i -X OPTIONS "https://jj-content-staging-1341668543.cos.ap-singapore.myqcloud.com/__cors_check__" \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type,x-cos-meta-test"
```

关键响应：

```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:3001
Access-Control-Allow-Methods: PUT,GET,POST,HEAD
Access-Control-Allow-Headers: content-type,x-cos-meta-test
Access-Control-Expose-Headers: ETag,Content-Length,x-cos-request-id
Access-Control-Max-Age: 600
Vary: Origin, Access-Control-Request-Headers, Access-Control-Request-Method
```

结论：`localhost:3001` 已放行，M 同学可以重新刷新本地页面再试。
