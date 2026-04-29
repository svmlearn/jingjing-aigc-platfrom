---
name: jingjing-design-system
version: 1.0
purpose: Shared visual design system for merchant-facing and platform-admin interfaces.
theme: dark-ai-workbench
colors:
  page: "#050505"
  body: "#080808"
  sidebar: "#0a0a0a"
  panel: "#0d0d0d"
  input: "#050505"
  text_primary: "#e0e0e0"
  text_strong: "#ffffff"
  accent: "#f59e0b"
  accent_hover: "#d97706"
  border_subtle: "rgba(255,255,255,0.10)"
typography:
  sans: "Avenir Next, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  mono: "SFMono-Regular, Cascadia Code, Roboto Mono, Menlo, monospace"
  serif: "Songti SC, STSong, Noto Serif CJK SC, Georgia, serif"
radii:
  control: "8px"
  panel: "12px-24px"
  workbench: "24px-28px"
---

# 静境平台 DESIGN.md

## 1. Overview

静境平台的界面是一套统一的 AI 工作台设计系统，覆盖商家前台和平台管理后台。它服务于咨询诊断、内容生成、视频工作台、素材管理、Agent 配置、知识管理和后台运营配置等场景。

设计目标是让产品呈现为“专业、克制、可信赖的 AI 经营控制台”：深色工作台为主，琥珀色作为关键动作和 AI 能力信号，细边框与低透明度层次建立信息结构，中文内容保持清晰可读。

本文件是前台和后台共用的设计规范。后台页面可以提高信息密度，但不应脱离同一套主题色、字体、组件语言和状态表达。

## 2. Design Principles

### 2.1 Shared Product Language

前台和后台共用同一套视觉语言：

```text
深色工作台
琥珀色强调
低对比细边框
左侧导航 + 主工作区
表单、列表、详情、调试面板并重
```

后台不是另一套独立视觉系统。平台管理端可以更密、更工具化，但仍应让人一眼看出属于同一个产品。

### 2.2 Quiet Control, Clear States

界面应优先服务操作和判断：

- 当前所在模块要清楚。
- 可执行动作要清楚。
- 草稿、启用、禁用、失败、索引中、依赖未满足等状态要清楚。
- 主按钮只给关键操作，例如保存、发布、运行测试、设为线上。
- 次要动作保持低调，避免抢占主任务注意力。

### 2.3 AI Workbench Orientation

整体气质是 AI 工作台和运营控制台：

- 适合长时间使用。
- 支持复杂配置和调试。
- 展示输入、上下文、运行结果和日志。
- 具有轻微“系统感”和“顾问感”，但不牺牲可读性。

## 3. Color Palette & Roles

### 3.1 Core Dark Surfaces

```css
--jj-bg-page: #050505;
--jj-bg-body: #080808;
--jj-bg-sidebar: #0a0a0a;
--jj-bg-panel: #0d0d0d;
--jj-bg-input: #050505;
```

Usage:

- `#050505`：页面底色、输入区、深层嵌套面。
- `#080808`：页面主体背景、卡片 header。
- `#0a0a0a`：左侧导航、列表栏、次级面板。
- `#0d0d0d`：主工作区、内容面板、详情容器。

### 3.2 Text

```css
--jj-text-primary: #e0e0e0;
--jj-text-strong: #ffffff;
--jj-text-muted-80: rgba(255,255,255,0.8);
--jj-text-muted-60: rgba(255,255,255,0.6);
--jj-text-muted-40: rgba(255,255,255,0.4);
--jj-text-muted-30: rgba(255,255,255,0.3);
```

Usage:

- 主文字使用 `#e0e0e0`。
- 强强调文字使用 `#ffffff`，控制使用频率。
- 辅助说明使用 `white/60` 或 `white/40`。
- 空状态和弱提示使用 `white/30`。

### 3.3 Brand Accent

```css
--jj-brand-50: rgba(245, 158, 11, 0.1);
--jj-brand-100: rgba(245, 158, 11, 0.2);
--jj-brand-500: #f59e0b;
--jj-brand-600: #d97706;
--jj-brand-700: #b45309;
```

Tailwind mapping:

```text
amber-500
amber-600
amber-500/10
amber-500/20
amber-500/40
```

Usage:

- 主操作按钮。
- 当前选中态。
- AI 生成中 / AI 能力相关提示。
- 关键状态或系统信号。
- hover border 或轻背景。

Rule:

```text
琥珀色是信号色，不是大面积背景色。
```

### 3.4 Borders & Dividers

```text
border-white/5
border-white/10
border-white/20
border-amber-500/20
border-amber-500/40
```

Usage:

- 默认分割线：`border-white/10`。
- 弱分割和卡片内部线：`border-white/5`。
- 选中或 hover：`border-amber-500/40`。
- 风险或依赖未满足：使用状态色边框，不使用大面积色块。

### 3.5 Status Colors

```text
success: emerald-500
warning: amber-500
danger: red-500
disabled: white/30
info: white/60
```

Status surfaces:

```text
success bg: emerald-500/10
warning bg: amber-500/10
danger bg: red-900/20
neutral bg: white/5
```

## 4. Typography

### 4.1 Font Families

Use the existing app font tokens:

```css
--font-sans-stack: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-geist-mono: "SFMono-Regular", "Cascadia Code", "Roboto Mono", Menlo, monospace;
--font-cormorant: "Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif;
```

Roles:

- Sans：默认 UI、导航、按钮、表格、表单。
- Serif / heading：页面标题、内容结果、咨询输出、需要顾问感的摘要。
- Mono：运行日志、系统状态、版本号、ID、调试信息、技术标签。

### 4.2 Type Scale

```text
Page title:       text-xl / text-2xl, font-heading or font-serif
Section title:    text-sm / text-base, font-medium
Body text:        text-sm, leading-relaxed
Dense table text: text-xs / text-sm
Tiny label:       text-[10px], uppercase, tracking-widest
Code / IDs:       text-xs, font-mono
```

Tiny labels are a core visual pattern:

```text
text-[10px] uppercase tracking-widest text-white/40 font-medium
```

Use them for section eyebrows, state markers, version labels, tool summaries, and field captions.

## 5. Layout Principles

### 5.1 App Frame

Desktop layout:

```text
min-h-screen
├── sidebar: 256px
└── main
    └── workbench container
        ├── header: 64px
        └── content
```

Recommended tokens:

```text
sidebar: w-64
header: h-16
main padding: p-6 / lg:p-10 / lg:p-12
workbench border: border-white/10
workbench radius: rounded-[24px] to rounded-[28px]
workbench bg: #0d0d0d
```

### 5.2 Workspace Density

Merchant workbench:

- Can use more spacious result areas.
- Good for left context panel + right preview / conversation / generated output.

Platform admin:

- Higher information density.
- Prefer list + detail, tabs, compact tables, status rows, and side panels.
- Keep the same dark surfaces and accent system.

### 5.3 Common Page Skeleton

```text
+----------------------------------------------------------------------------+
| Sidebar                    | Workbench                                      |
|                            | +--------------------------------------------+ |
| Navigation                 | | Header: title, status, primary actions     | |
|                            | +--------------------------------------------+ |
|                            | | Content: list/detail, editor, table, logs  | |
| Account / switch           | +--------------------------------------------+ |
+----------------------------------------------------------------------------+
```

### 5.4 Two-Column Tool Layout

Use for Agent config, Agent debug, article/video workbench:

```text
Left: 320px - 420px      configuration, context, filters
Right: flex-1            detail, preview, result, logs
Divider: border-white/10
```

## 6. Components

### 6.1 Sidebar Navigation

Style:

```text
bg-[#0a0a0a]
border-r border-white/10
text-white/55 default
text-white active
active marker: bg-amber-500 small dot
hover: bg-white/5 text-white
```

Navigation item:

```text
rounded-xl
px-4 py-3
gap-3
icon size: 16px
```

### 6.2 Header Bar

Style:

```text
h-16
border-b border-white/10
px-6 or px-8
display flex justify-between
```

Content:

- Page title.
- Small system label or version.
- Primary action group.
- Optional status badge.

### 6.3 Cards & Panels

Base panel:

```text
bg-[#0d0d0d]
border border-white/10
rounded-xl or rounded-2xl
shadow-[0_24px_120px_rgba(0,0,0,0.45)]
```

Inner card:

```text
bg-[#0a0a0a]
border border-white/5
rounded-xl
```

Card header:

```text
bg-[#080808]
border-b border-white/5
px-6 py-4
text-[10px] uppercase tracking-widest text-white/40
```

### 6.4 Buttons

Primary:

```text
bg-amber-600/80
hover:bg-amber-600
text-white
rounded-md
text-[10px]
uppercase
tracking-widest
font-medium
icon + label
```

Secondary:

```text
bg-white/5
hover:bg-white/10
border border-white/10
text-white/70
rounded-md
```

Ghost:

```text
text-white/40
hover:text-white/80
hover:bg-white/5
```

Danger:

```text
border-red-500/20
bg-red-900/20
text-red-500
```

### 6.5 Forms

Inputs:

```text
bg-[#050505]
border border-white/10
rounded-md / rounded-lg
px-3 or px-4
py-2.5 or py-3
text-sm
text-[#e0e0e0]
placeholder:text-white/30
focus:border-amber-500
outline-none
```

Labels:

```text
text-[10px]
uppercase
tracking-widest
text-white/60
mb-2
```

Textarea:

- Use same surface and border.
- For prompt/content editors, use monospace or readable serif depending on context.
- System Prompt editor can use `font-mono` for control/debug feeling.
- Generated content editor can use `font-serif`.

### 6.6 Tabs & Segmented Controls

Tabs:

```text
bg-white/5 container
active: bg-amber-500/10 text-amber-500 border-amber-500/20
inactive: text-white/50 hover:text-white/80
```

Use for:

- 草稿 / 生效版本 / 历史版本
- 单体技能 / 技能集
- 知识文档 / 知识集
- 测试结果 / 工具摘要 / 命中知识

### 6.7 Status Badges

Base:

```text
text-[10px]
uppercase
tracking-widest
rounded-md
border
px-2 py-1
```

Mapping:

```text
draft:    border-white/10 bg-white/5 text-white/60
enabled:  border-emerald-500/20 bg-emerald-500/10 text-emerald-500
disabled: border-red-500/20 bg-red-900/20 text-red-500
active:   border-amber-500/30 bg-amber-500/10 text-amber-500
archived: border-white/10 bg-white/5 text-white/40
indexing: border-amber-500/20 bg-amber-500/10 text-amber-500
failed:   border-red-500/20 bg-red-900/20 text-red-500
```

### 6.8 Tables

Use for admin lists:

```text
table bg transparent or #0d0d0d
header text-[10px] uppercase tracking-widest text-white/40
row border-b border-white/5
row hover bg-white/5
cell text-sm text-white/70
```

Avoid large colored rows. Use badges for status.

### 6.9 Empty, Loading, Error

Empty:

```text
border border-dashed border-white/10
text-white/40
single lucide icon
short action button if needed
```

Loading:

```text
RefreshCw animate-spin text-amber-500
text-sm font-serif italic text-white/40
```

Error:

```text
icon container: bg-red-900/20 border border-red-500/20 text-red-500 rounded-full
title: text-sm uppercase tracking-widest text-[#e0e0e0]
body: text-white/40
actions: retry / return
```

## 7. Product-Specific Patterns

### 7.1 Agent Configuration

Use list + detail:

```text
Left: Agent list with status and online marker
Right: Agent detail with basic info, prompt, skills, knowledge sets
Header: save draft, publish, copy, set online
```

State separation must be visible:

```text
Agent lifecycle: draft / enabled / disabled
Prompt version: draft / active / archived
Online binding: consultation_default -> agent_id
```

### 7.2 Skill Management

Skill is a prompt asset, not a tool marketplace.

Show:

- name
- description
- when_to_use
- dependencies
- status
- body
- mounted agents

Do not show:

- install button like plugin marketplace
- arbitrary tool permission toggles
- risk/priority fields in first version

### 7.3 Knowledge Management

Knowledge must be organized as sets:

```text
Knowledge document -> Knowledge Set -> Agent mount
```

Upload flow must require choosing at least one knowledge set.

Display:

- document status: indexing / indexed / failed
- set status: draft / enabled / disabled
- agent bindings
- retry action for failed indexing

### 7.4 Agent Debug

Use two-column diagnostic layout:

```text
Left: selected agent, merchant, input, config summary
Right: final answer, loaded skills, knowledge hits, memory calls, tool summary
```

Test runs:

- saved to agent_test_runs
- not real consultation history
- do not consume merchant credits

### 7.5 Credits & Membership

Credits are product-facing “积分”.

Use in UI:

- `积分`
- `会员等级`
- `剩余积分`
- `用量记录`

Use in code:

- `credits`
- `credit_ledger`
- `usage_events`
- `entitlement`

## 8. Motion & Interaction

Use subtle motion:

```text
transition-colors
transition-all
animate-in fade-in duration-300
slide-in-from-right duration-200
animate-spin
```

Motion roles:

- loading indicator
- drawer open
- tab content fade
- hover emphasis

Avoid:

- decorative particles
- bouncing elements
- large animated backgrounds
- continuous non-functional motion

## 9. Responsive Behavior

Desktop:

- Persistent sidebar.
- Workbench container.
- Two-column layouts for configuration and debug.

Tablet:

- Sidebar may collapse or become top nav.
- Detail panels can stack.

Mobile:

- Horizontal nav chips.
- Single-column content.
- Primary actions remain sticky or near header.
- Touch targets minimum 40px height.

## 10. Accessibility & Readability

- Maintain clear contrast on dark surfaces.
- Do not use `white/30` for important body text.
- Important actions need text labels, not icon-only.
- Icon-only buttons require accessible labels.
- Error messages must state what happened and what the user can do next.
- Long prompt editors should support scroll, monospaced display, and stable height.

## 11. Do / Don't

### Do

- Use the shared dark workbench theme for both merchant and admin surfaces.
- Use amber only for important state and action signals.
- Use list + detail for configuration-heavy pages.
- Keep status badges compact and consistent.
- Preserve clear distinction between Agent, Skill, Knowledge, Tool, Memory.
- Prefer lucide icons.
- Keep admin pages denser than merchant creative workbenches while sharing the same theme.

### Don't

- Do not introduce a separate white admin theme for new backend pages.
- Do not use purple/blue gradients as dominant theme.
- Do not use beige/cream/brown as primary surfaces.
- Do not create marketing-style hero sections for app or admin pages.
- Do not use decorative blobs, bokeh, or gradient orbs.
- Do not make Skill look like a plugin marketplace or tool permission store.
- Do not imply uploaded Knowledge automatically affects all Agents.
- Do not use large colored blocks where a badge or small accent is enough.

## 12. Implementation Notes

Current app references:

- `app/src/app/globals.css` defines font tokens and shadcn-compatible theme variables.
- `app/src/components/app/dashboard-shell.tsx` shows the current merchant dark workbench shell.
- `docs/designs/AI设计的原型图/src/index.css` contains prototype color tokens.
- `docs/designs/AI设计的原型图/src/components/layout/MainLayout.tsx` contains the original AI workbench frame.

When updating platform admin pages, prefer migrating toward the shared workbench theme instead of extending the old light admin palette.

Recommended component sources:

- Existing shadcn/ui components for inputs, buttons, badges, tables, dialogs.
- lucide-react for icons.
- Tailwind tokens from this file for custom surfaces.

## 13. Agent Prompt Guide

Use this prompt when asking another AI to draw or implement UI:

```text
Use the Jingjing shared DESIGN.md system.

The UI should feel like a professional AI workbench used by both merchants and platform admins. Use dark surfaces: page #050505, sidebar #0a0a0a, panel #0d0d0d, input #050505. Use #e0e0e0 for primary text and amber #f59e0b / #d97706 as the only primary accent.

Use a left navigation plus main workbench container. For admin configuration pages, use compact list + detail layouts, tabs, tables, status badges, and diagnostic panels. Keep the design dense enough for operations but visually consistent with the merchant-facing AI workbench.

Use small uppercase tracking labels, subtle white/10 borders, rounded-xl panels, lucide icons, and amber active states. Do not use marketing hero sections, decorative gradient blobs, purple gradients, or a separate white admin theme.

Skill is a prompt asset, not a tool marketplace. Knowledge must be organized as Knowledge Sets before being mounted to Agent.
```
