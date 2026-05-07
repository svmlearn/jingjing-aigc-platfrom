# 咨询 Agent DBS Skill 配置与 Reference 支持改造计划

日期：2026-05-07
状态：讨论稿

## 1. 背景

当前营销 Agent 已经有提示词和知识库，负责解决“如何做内容、如何写标题、如何做短视频、如何把内容排进工作台”等执行问题。

咨询 Agent 的定位不应该和营销 Agent 重叠。它更上游，负责判断：

1. 用户到底该不该做这个方向
2. 这个领域是否足够大，能不能长期产出
3. 这个方向是否足够有价值，能否带来关注或付费
4. 同行是否真的把问题讲清楚了
5. 用户自己是否已经把事情搞清楚，并且能讲清楚

核心判断句：

> 找一个足够大、足够有价值、并且没有被同行研究清楚的领域，把事情搞清楚，并且讲清楚。

本次调研了本地个人 IP 项目中的 DBS skill 体系：

`/Users/wy/Desktop/个人IP/个人IP/.agents/skills/`

结论是：DBS 体系非常适合成为咨询 Agent 的底层诊断工具箱，但不应原样整体挂载。

## 2. 总体判断

`dbs/SKILL.md` 本身是一个 router，只负责把用户路由到不同子 skill，不直接做诊断。

而当前平台的 Agent Console 已经有 skill selector 和 progressive disclosure 机制。如果再把 `/dbs` router 当作一个 skill 接进咨询 Agent，会形成“双层路由”：

1. 平台 runtime 先选中 `dbs`
2. `dbs` 再要求转发到其他 `/dbs-*`
3. 但我们的 runtime 并不支持 skill 内部再调用另一个 skill

所以正确做法不是“挂一个 dbs skill”，而是把真正有诊断能力的 DBS 子 skill 拆成平台内的独立 skill。

## 3. 咨询 Agent 推荐 Skill 清单

### 3.1 P0：首批必须引入

| 来源 skill | 建议平台 skill key | 咨询 Agent 中的角色 | 触发场景 | reference 依赖 |
|---|---|---|---|---|
| `dbs-diagnosis` | `dbs_diagnosis` | 商业模式与问题诊断 | 用户带着具体商业问题、方向不确定、变现结构不清、流量和收入关系混乱 | `diagnosis_公理与诊断框架.md`、`diagnosis_问题消解案例库.md` |
| `dbs-deconstruct` | `dbs_deconstruct` | 概念拆解与语言校准 | 用户说“赛道、定位、人设、价值、爆款、IP”这类模糊词，或同行概念使用混乱 | `deconstruct_语言与概念框架.md`、`deconstruct_解构案例库.md`、`高频概念词典.md` |
| `dbs-benchmark` | `dbs_benchmark` | 对标判断 | 用户想找对标、学谁、模仿谁、判断同行是否值得参考 | `benchmark_对标方法论.md`、`benchmark_平台运营知识.md` |
| `dbs-goal` | `dbs_goal` | 目标清晰化 | 用户说“我想做个人 IP”“我想变现”“我想做短视频”但目标不可检查 | 暂无强 reference，可先内联 |

这四个 skill 是咨询 Agent 的骨架：先把用户的问题、目标、概念和对标对象搞清楚，再进入内容/营销执行。

### 3.2 P1：第二批建议引入

| 来源 skill | 建议平台 skill key | 咨询 Agent 中的角色 | 触发场景 | reference 依赖 |
|---|---|---|---|---|
| `dbs-slowisfast` | `dbs_slow_is_fast` | 长期资产判断 | 用户想走捷径、想快速起号、想省掉积累过程、在关键环节找“快方法” | 可先内联，后续整理为资产/复利类知识 |
| `dbs-action` | `dbs_action_diagnosis` | 执行卡点诊断 | 用户知道该做什么但做不动、反复换方向、沉迷学习不执行 | `action_心理诊断框架.md`、`action_信号案例库.md` |
| `dbs-chatroom` | `dbs_multi_role_discussion` | 多专家讨论入口 | 用户希望多个视角讨论一个方向，或后续做多角色语音咨询 | 依赖角色库，而不是普通知识库 |

其中 `dbs-chatroom` 不建议第一批做成普通 skill。它更像未来“多个咨询专家轮流发言”的产品能力，需要和多角色 orchestrator、语音播放队列、发言调度一起设计。

### 3.3 暂不放入咨询 Agent，转给营销 Agent

| 来源 skill | 建议归属 | 原因 |
|---|---|---|
| `dbs-content` | 营销 Agent / 内容 Agent | 负责内容形式、表达效率、平台内容判断，偏执行 |
| `dbs-hook` | 营销 Agent / 短视频脚本 Agent | 负责短视频开头优化 |
| `dbs-xhs-title` | 营销 Agent / 图文 Agent | 负责小红书标题公式 |
| `dbs-ai-check` | 营销 Agent / 内容质检 Agent | 负责识别 AI 味和文案质检 |

咨询 Agent 可以输出“是否进入营销执行”的判断，但不直接替代营销 Agent 生成标题、开头和内容排期。

### 3.4 不建议迁入平台 runtime

| 来源 skill | 不迁入原因 |
|---|---|
| `dbs` | 只是 router，和平台 skill selector 重叠 |
| `dbs-save` | 绑定个人 IP 项目的本地存档机制 |
| `dbs-restore` | 绑定个人 IP 项目的本地恢复机制 |
| `dbs-report` | 绑定本地诊断报告生成流程，后续可作为平台报告导出能力重做 |
| `dbs-agent-migration` | 面向 Claude/Codex 工作台整理，不属于商家咨询 |
| `dbskill-upgrade` | 面向 skill 自身升级，不是用户侧咨询能力 |

## 4. 咨询 Agent 和营销 Agent 的协作边界

咨询 Agent 负责“做什么、为什么做、值不值得做、怎么判断这个方向成立”。

营销 Agent 负责“怎么表达、怎么拆内容、怎么做标题、怎么写开头、怎么进入图文/视频工作台”。

建议的交接关系：

```text
用户原始想法
  -> 咨询 Agent
    -> 目标清晰化
    -> 概念拆解
    -> 领域容量判断
    -> 价值判断
    -> 对标判断
    -> 方向诊断报告
  -> 营销 Agent
    -> 内容策略
    -> 选题库
    -> 标题/开头
    -> 图文/视频工作台
```

咨询 Agent 的输出不应该是“给你 10 个爆款标题”，而应该是：

1. 这个方向是否成立
2. 成立的前提是什么
3. 当前最大的不确定性是什么
4. 需要先验证什么
5. 如果进入内容执行，应该把什么信息交给营销 Agent

## 5. Reference 支持现状

当前平台的 `agent_skills` 表已经有这些字段：

1. `body`
2. `dependencies`
3. `metadata`

但 runtime 目前只稳定使用：

1. skill 基本信息
2. `body`
3. `dependencies`

当前相关代码位置：

| 模块 | 当前作用 |
|---|---|
| `app/supabase/migrations/202604270001_v22_agent_console_foundation.sql` | 定义 `agent_skills` 表，已有 `dependencies` 和 `metadata` |
| `app/src/contracts/agent-console.ts` | `AgentSkillDto` 包含 `metadata` |
| `app/src/server/api/consultation-runtime/skills.ts` | 将 `AgentSkillDto` 转成 runtime skill，但目前没有把 references 作为一等能力处理 |
| `app/src/server/api/consultation-runtime/types.ts` | `ConsultationRuntimeSkill` 当前只 pick 了基础字段和 `dependencies` |
| `app/src/components/platform-admin/agent-console-pages.tsx` | Skill 编辑表单只暴露正文和 dependencies，不暴露 references |

这意味着：即使在 DBS skill 正文里写了“深度参考：某某 reference 文件”，平台也不会自动读取这些 reference。

## 6. Reference 改造目标

需要让 skill 支持“轻正文 + 可检索参考资料”。

不要把所有 reference 全量塞进 skill body。原因：

1. DBS reference 文件较长，直接塞进 prompt 会挤占上下文
2. 当前 active skill 有数量和 token 预算，长正文会被裁剪
3. reference 的正确用法应该是按问题检索，而不是每次全量加载

建议目标结构：

```json
{
  "references": [
    {
      "type": "knowledge_document",
      "title": "diagnosis_公理与诊断框架",
      "documentId": "uuid",
      "usage": "retrieve_when_active"
    },
    {
      "type": "knowledge_set",
      "title": "DBS 商业诊断知识包",
      "knowledgeSetId": "uuid",
      "usage": "retrieve_when_needed"
    }
  ]
}
```

短期可以先放在 `metadata.references`，不急着新增数据库列。等 UI 和 runtime 都稳定后，再决定是否提升为独立列。

## 7. 改造计划

### Phase 1：不改 schema，先把能力跑起来

目标：用现有 Agent Console 能力，把咨询 Agent 的 DBS 能力先配置出来。

动作：

1. 新建或导入 P0 四个 skill：
   - `dbs_diagnosis`
   - `dbs_deconstruct`
   - `dbs_benchmark`
   - `dbs_goal`
2. 每个 skill body 做平台化改写：
   - 删除个人项目里的本地路径和命令式存档逻辑
   - 保留诊断框架、触发场景、输出模板、边界规则
   - 增加“何时交给营销 Agent”的交接规则
3. 建立知识集：
   - `DBS 商业诊断知识包`
   - `DBS 概念拆解知识包`
   - `DBS 对标分析知识包`
4. 把 reference markdown 作为知识文档导入知识库。
5. 每个 skill 的 `dependencies` 至少包含：

```json
["retrieve_knowledge_base"]
```

6. 在 skill body 末尾保留轻量 reference hint，例如：

```markdown
## 参考资料

当需要案例或公理依据时，优先检索知识库：
- diagnosis_公理与诊断框架
- diagnosis_问题消解案例库
```

交付标准：

1. 咨询 Agent 能根据用户问题激活正确 skill
2. 能在需要依据时调用知识库检索
3. 输出仍然是咨询诊断，不滑向标题/脚本生产

### Phase 2：runtime 支持 `metadata.references`

目标：skill 被激活时，runtime 能看到它绑定了哪些 references。

动作：

1. 扩展 runtime 类型：
   - `ConsultationRuntimeSkill` 增加 `metadata`
   - 或增加标准化字段 `references`
2. 修改 `toRuntimeSkill()`：
   - 从 `skill.metadata.references` 解析 references
   - 对非法结构做容错，不能让坏 metadata 打断咨询
3. 新增 `buildSkillReferencePrompt()`：
   - 不注入 reference 全文
   - 只注入“当前 active skill 推荐检索哪些知识集/文档”
4. 在 tool planning/system prompt 中加入规则：
   - 当 active skill 有 `retrieve_when_active` reference，且用户问题需要框架、案例、定义、判断标准时，优先调用 `retrieve_knowledge_base`
5. 在 runtime snapshot 中记录：
   - active skill
   - reference hints
   - 实际检索过的 knowledge document/chunk

交付标准：

1. `metadata.references` 能进入 runtime
2. active skill 的 reference hint 能影响知识库检索
3. snapshot 可以追踪这次咨询用了哪些 skill 和 reference

### Phase 3：Agent Console UI 支持 references 编辑

目标：平台管理员可以在 Skill 编辑页配置 references，而不是手写 JSON。

动作：

1. Skill 编辑页增加 “References” 区域。
2. 支持添加：
   - knowledge set
   - knowledge document
   - URL 型参考
   - 只读 local path 备注
3. 每条 reference 支持：
   - title
   - type
   - id/path/url
   - usage policy
4. 保存时写入 `metadata.references`。
5. 列表页显示 skill 是否绑定 reference。

交付标准：

1. 管理员无需改数据库即可配置 references
2. UI 保存后 runtime 能读取
3. 老 skill 没有 references 时仍正常运行

### Phase 4：导入工具和种子数据

目标：降低从本地 DBS skill 迁移到平台的手工成本。

动作：

1. 做一个一次性导入脚本或管理端导入入口。
2. 输入来源：
   - DBS `SKILL.md`
   - DBS `references/*.md`
3. 输出到平台：
   - `agent_skills`
   - `knowledge_documents`
   - `knowledge_sets`
   - skill 和 reference 的绑定 metadata
4. 导入时做平台化清洗：
   - 去掉本地存档/恢复/命令行逻辑
   - 去掉不适合商家端展示的措辞
   - 将“用户个人项目”的路径替换为平台知识库引用

交付标准：

1. 可以重复导入，不产生重复 skill
2. reference 文档能进入知识库
3. skill 和 reference 绑定关系可追踪

## 8. 推荐的首批配置

### 咨询 Agent system prompt 需要强调

1. 先诊断方向，不急着做内容。
2. 遇到模糊词，先拆概念。
3. 遇到“我要做短视频/我要涨粉”，先判断领域和价值，不直接进入标题/脚本。
4. 遇到“我该学谁”，用对标 skill，而不是凭感觉推荐账号。
5. 输出必须能交给营销 Agent 继续执行。

### 咨询 Agent 知识库首批知识集

| 知识集 | 包含文档 | 用途 |
|---|---|---|
| `DBS 商业诊断知识包` | `diagnosis_公理与诊断框架.md`、`diagnosis_问题消解案例库.md` | 商业模式判断、问题消解、价值判断 |
| `DBS 概念拆解知识包` | `deconstruct_语言与概念框架.md`、`deconstruct_解构案例库.md`、`高频概念词典.md` | 拆概念、校准语言、发现伪问题 |
| `DBS 对标分析知识包` | `benchmark_对标方法论.md`、`benchmark_平台运营知识.md` | 判断对标是否值得学、怎么学 |

### Skill 激活顺序建议

1. 用户目标模糊：先 `dbs_goal`
2. 用户概念混乱：先 `dbs_deconstruct`
3. 用户商业问题明确：先 `dbs_diagnosis`
4. 用户问对标：先 `dbs_benchmark`
5. 用户急着做内容：咨询 Agent 先判断是否该进入营销执行；如果已经成立，再交给营销 Agent

## 9. 风险和注意事项

1. DBS 原始 skill 的语气较锋利，迁入商家端时需要保留判断力，但降低攻击性。
2. DBS reference 里有大量个人表达和历史案例，不能未经整理就当成平台官方标准。
3. `dbs-action` 涉及心理诊断语境，迁入时要避免医疗化、人格判断或过度归因。
4. `dbs-chatroom` 涉及多角色讨论，应该等 native tool loop 和多角色语音 orchestrator 更稳定后再做。
5. 不要让咨询 Agent 变成“另一个营销 Agent”。一旦开始输出标题、开头、文案，应该触发交接，而不是继续在咨询 Agent 内完成。

## 10. 下一步建议

建议后续开一个独立实现分支，按下面顺序推进：

1. 先做 P0 四个 skill 的平台化改写稿。
2. 手动导入知识集和 reference 文档，跑一次无 schema 改造的验证。
3. 验证通过后，再做 `metadata.references` runtime 支持。
4. 最后补 Agent Console UI 的 references 编辑能力。

这样可以先验证“咨询 Agent 的诊断灵魂是否对”，再决定要不要投入更重的 reference 基础设施改造。
