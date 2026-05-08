# 2026-05-08 删除业务内容型代码兜底

## 背景

新账号 `ywangyangw1@163.com` 的咨询链路仍出现“本地生活服务 / 到店咨询 / 商家资料”等默认语义。产品判断是：资料不足时不应该由代码硬塞行业、场景、客群、CTA、内容日历、图文或视频脚本，应该让 Agent 识别缺口并追问用户。

## 本轮处理

1. 咨询策略快照不再自动生成内容日历、图文 brief、视频 brief。
2. 圆桌咨询初始策略快照改为空策略，不再使用“本地生活服务 / 本地化服务”默认定位。
3. 图文生成取消代码内业务草稿 fallback；无模型密钥或模型失败时只返回明确错误。
4. 视频上下文取消固定三条脚本候选和门店场景脚本兜底；信息不足时标记缺口，不生成脚本草稿。
5. 视频链路测试草稿不再默认填“核心服务 / 私信咨询或预约体验”。
6. 可见文案从“商家资料 / 商家上下文 / 商家知识库 / 商家设置”进一步收敛到“用户信息 / 用户知识库 / 当前资产”。
7. 本地 demo 用户资料改为空白用户信息，避免无 Supabase 环境下继续注入普拉提门店样例。

## 验证

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm build`：通过
- 相关测试：
  - `node --test src/server/api/consultation-service.test.ts src/server/api/article-prompt-templates.test.ts src/server/api/video-growth-context.test.ts src/server/api/video-chain-test-draft.test.ts`：40 passed
- 全量 `node --test $(find src -name '*.test.ts' -print)`：94 passed，1 failed
  - 失败项为 `src/server/api/platform-settings-schema.test.ts` 直接导入 `server-only` 的 Node 直跑限制，不是本轮业务断言失败。

## 后续注意

测试中仍可保留用户明确提供的行业或门店样例，用来验证“显式输入可以被保留”。但任何测试都不应再要求代码在资料不足时默认生成本地生活、门店、到店、私信预约等业务内容。
