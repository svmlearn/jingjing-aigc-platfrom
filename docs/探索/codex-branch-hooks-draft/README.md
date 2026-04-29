# Codex 分支事件 Hooks 草稿箱

日期：2026-04-28

## 为什么会有这个草稿

V2.2 后台并行开发时，我们采用了多个派生 Codex 窗口 / worktree 分支：

- foundation
- auth/RBAC
- agent assets API
- admin console UI

实际协作中，用户承担了大量“消息搬运”：

1. main 线程写给某个分支的任务或返修话术。
2. 用户复制给对应分支窗口。
3. 分支完成后，用户再把结果复制回 main。
4. main 复验，发现问题后再生成返修话术。
5. 用户再次复制给分支。

这套流程里，用户没有做产品决策，只是在窗口之间传递状态。因此我们尝试设计一套 Codex hooks，把“分支完成通知 main、main 返修通知分支”变成文件事件队列。

## 当时的设计思路

第一版想做成：

- worker 分支完成后发布 `branch_ready` 事件。
- main 窗口通过 hook 读取 `.codex/branch-events/inbox/`。
- main 串行验收分支，临时 merge、跑 lint/build。
- 通过则本地 merge main。
- 不通过则写 control board，worker 窗口下次继续时自动读到返修内容。

草稿实现包含：

- `config.toml`：项目级 Codex hooks 配置。
- `hooks/`：main/worker 上下文注入和 Stop hook。
- `scripts/`：`branch-done`、`branch-event-status`、`branch-inbox-list`。
- `branch-events/README.md`：事件队列目录说明。
- `branch-hooks-workflow.md`：当时拟定的使用说明。
- `branch-control-board-template.md`：返修和合并状态控制板模板。

## 为什么撤回

这版方案仍然要求 worker 分支在完成后运行：

```bash
.codex/scripts/branch-done --handoff docs/handoff/xxx.md --progress docs/progress/xxx.md
```

或者要求用户告诉 worker agent 去运行这条命令。

这没有真正满足用户需求。用户本身并不写代码，也不应该记住或输入这类命令；如果还需要用户把“运行哪个脚本、传什么参数”告诉每个分支，本质上只是把“复制返修话术”换成了“复制命令话术”，仍然是消息搬运。

另外，Codex hooks 当前更适合：

- 注入上下文
- 做门禁
- 做提醒
- 续跑当前窗口

但它不能天然保证“一个 Codex 派生窗口完成后，自动唤醒另一个独立 Codex 窗口并交给它处理”。所以这版 hooks 只能做半自动，不能完成真正想要的跨窗口调度。

## 当前结论

这套 hooks 不应作为项目活跃机制启用。

已撤掉项目根目录的 `.codex/` 活跃配置和脚本，仅保留本草稿箱供后续参考。

更贴近真实需求的方向应该是：

1. 用户只说“这个分支做完后通知 main”，不用写命令。
2. worker agent 的任务书中自动包含“完成后发布事件”的固定交付协议。
3. 或由更高层的 Codex 派生树 / 子 agent 调度能力直接管理分支完成事件。
4. 如果继续用 hooks，需要做到“零用户命令”，例如 worker Stop hook 可靠识别完成状态并自动发布，但这需要非常严格的完成判定，避免误触发。

## 后续如果重启这个方向

不要从“写一个 branch-done 命令”开始。

更好的下一版问题定义应该是：

- 用户完全不输入命令。
- worker 完成标准必须可机器判断。
- 分支任务书必须标准化，包含 handoff/progress/commit/验证的固定路径或固定元数据。
- main 的自动消费必须只处理明确的完成信号，不能误把中间状态当成完成。
- 任何自动 merge 仍然只能是本地 main，不 push、不碰 staging、不碰 production。

这个草稿的价值是证明：

- 文件事件队列作为“跨窗口记忆”是可行的。
- 但显式命令触发对当前用户来说不够好。
