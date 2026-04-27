
// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, className = '', strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const Ico = {
  Dashboard:  'd="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"',
  Ticket:     (s=16) => <Icon size={s} d={["M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z","M9 9h.01","M9 12h.01","M9 15h.01"]} />,
  Users:      (s=16) => <Icon size={s} d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M23 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75",'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']} />,
  Book:       (s=16) => <Icon size={s} d={["M4 19.5A2.5 2.5 0 0 1 6.5 17H20","M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"]} />,
  Bot:        (s=16) => <Icon size={s} d={["M12 8V4H8","M3 13.5a9 9 0 0 1 18 0","M3 13.5a9 9 0 0 0 18 0","M9 16.5v.5","M15 16.5v.5","M12 2a2 2 0 0 1 2 2v4H10V4a2 2 0 0 1 2-2z"]} />,
  Zap:        (s=16) => <Icon size={s} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  Bug:        (s=16) => <Icon size={s} d={["M8 2l1.88 1.88","M14.12 3.88 16 2","M9 7.13v-1a3.003 3.003 0 1 1 6 0v1","M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6","M12 20v-9","M6.53 9C4.6 8.8 3 7.1 3 5","M6 13H2","M3 21c0-2.1 1.7-3.9 4-4","M20.97 5c0 2.1-1.6 3.8-3.5 4","M22 13h-4","M17 17c2.3.1 4 1.9 4 4"]} />,
  Settings:   (s=16) => <Icon size={s} d={['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z']} />,
  Plus:       (s=16) => <Icon size={s} d={["M12 5v14","M5 12h14"]} />,
  Refresh:    (s=16) => <Icon size={s} d={["M23 4v6h-6","M1 20v-6h6","M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"]} />,
  Copy:       (s=16) => <Icon size={s} d={["M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2","M16 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2"]} />,
  ChevronR:   (s=16) => <Icon size={s} d="M9 18l6-6-6-6" />,
  ChevronD:   (s=16) => <Icon size={s} d="M6 9l6 6 6-6" />,
  X:          (s=16) => <Icon size={s} d={["M18 6L6 18","M6 6l12 12"]} />,
  Check:      (s=16) => <Icon size={s} d="M20 6L9 17l-5-5" />,
  Alert:      (s=16) => <Icon size={s} d={['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z','M12 9v4','M12 17h.01']} />,
  Play:       (s=16) => <Icon size={s} d="M5 3l14 9-14 9V3z" />,
  Send:       (s=16) => <Icon size={s} d={["M22 2L11 13","M22 2L15 22 11 13 2 9l20-7z"]} />,
  Upload:     (s=16) => <Icon size={s} d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M17 8l-5-5-5 5","M12 3v12"]} />,
  Trash:      (s=16) => <Icon size={s} d={["M3 6h18","M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"]} />,
  Link:       (s=16) => <Icon size={s} d={["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71","M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"]} />,
  Eye:        (s=16) => <Icon size={s} d={['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z']} />,
  ArrowUp:    (s=16) => <Icon size={s} d={["M12 19V5","M5 12l7-7 7 7"]} />,
  BarChart:   (s=16) => <Icon size={s} d={["M12 20V10","M18 20V4","M6 20v-4"]} />,
  Shield:     (s=16) => <Icon size={s} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  AdminUser:  (s=16) => <Icon size={s} d={['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2','M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']} />,
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK = {
  agents: [
    { id: 'ag_001', name: '初始咨询 Agent', status: 'enabled', isOnline: true,
      role: '本地生活商家内容咨询顾问',
      promptVersion: 'v12 active',
      promptDraft: 'v13 draft',
      skills: ['sk_001','sk_002'],
      knowledgeSets: ['ks_001'],
      promptBody: `你是静境商家平台里的 AI 商业顾问，专注于帮助本地生活类商家（餐饮、美业、教培等）在小红书和抖音平台提升内容质量和客户成交效率。

你的核心职责是：
1. 帮助商家分析当前内容定位与竞争策略
2. 提供可操作的小红书/抖音内容创作建议
3. 识别商家在成交流程中的关键问题
4. 基于商家实际情况给出个性化建议

回答风格：专业但不生硬，像一位经验丰富的商业顾问，适当使用反问引导商家思考。`,
      promptDraftBody: `你是静境商家平台里的 AI 商业顾问，专注于帮助本地生活类商家在小红书和抖音平台提升内容质量和成交效率。

核心职责：
1. 帮助商家分析内容定位与竞争策略
2. 提供可操作的内容创作建议  
3. 识别成交流程中的关键问题
4. 基于商家实际情况给出个性化建议

回答风格：专业克制，适当使用反问引导商家深度思考，避免泛泛而谈。`,
    },
    { id: 'ag_002', name: '测试 Agent B', status: 'draft', isOnline: false,
      role: '咨询 Agent 测试版本',
      promptVersion: 'v13 draft',
      promptDraft: 'v14 draft',
      skills: ['sk_001','sk_003'],
      knowledgeSets: ['ks_001','ks_002'],
      promptBody: '这是测试 Agent B 的 System Prompt 草稿...',
      promptDraftBody: '这是测试 Agent B 最新草稿...',
    },
    { id: 'ag_003', name: '旧 Agent v1', status: 'disabled', isOnline: false,
      role: '旧版咨询顾问（已禁用）',
      promptVersion: 'v5 archived',
      promptDraft: null,
      skills: [],
      knowledgeSets: [],
      promptBody: '旧版 System Prompt...',
      promptDraftBody: '',
    },
  ],
  skills: [
    { id: 'sk_001', name: '门店定位方法', status: 'enabled',
      description: '用于处理本地生活门店的账号定位、客群分析和内容方向规划相关咨询。',
      whenToUse: '当用户询问门店定位、目标客群选择、账号风格确定、内容方向时触发。',
      dependencies: ['knowledge_retrieval'],
      body: `你需要先判断门店所在区域、目标客群和竞争格局，再给出定位建议：

1. 引导商家说清楚：门店类型、所在区域、目标客群年龄/消费能力
2. 分析同类竞争对手的内容风格和差异化空间
3. 给出 2-3 个可选定位方向，说明各自的适用场景
4. 推荐最适合的内容形式（探店/干货/故事）

不要给泛化建议，必须结合商家实际情况。`,
      mountedAgents: ['初始咨询 Agent', '测试 Agent B'],
    },
    { id: 'sk_002', name: '成交异议处理', status: 'enabled',
      description: '帮助商家识别和处理潜在客户的常见成交异议。',
      whenToUse: '当用户提到客户犹豫、价格异议、信任问题、竞品对比时触发。',
      dependencies: [],
      body: `处理成交异议的核心框架：

1. 先确认异议的真实原因（价格？信任？需求不明确？）
2. 用商家的真实案例和数据回应
3. 提供降低决策门槛的方案（试用、小额体验）
4. 避免直接反驳，转化为引导式对话`,
      mountedAgents: ['初始咨询 Agent'],
    },
    { id: 'sk_003', name: '小红书口吻策略', status: 'draft',
      description: '针对小红书平台内容特点调整表达口吻和内容结构。',
      whenToUse: '当用户询问小红书内容写作、标题优化、评论互动时触发。',
      dependencies: [],
      body: `小红书内容口吻策略：\n\n1. 标题要有情绪词和场景词\n2. 正文用第一人称分享语气\n3. 结尾带引导互动`,
      mountedAgents: ['测试 Agent B'],
    },
    { id: 'sk_004', name: '视频脚本策略', status: 'disabled',
      description: '抖音/视频号短视频脚本结构和拍摄建议。',
      whenToUse: '当用户询问视频拍摄、脚本、BGM选择时触发。',
      dependencies: ['knowledge_retrieval'],
      body: '视频脚本策略正文...',
      mountedAgents: [],
    },
  ],
  knowledgeSets: [
    { id: 'ks_001', name: '基础平台知识集', status: 'enabled', docCount: 3, mountedAgents: ['初始咨询 Agent','测试 Agent B'] },
    { id: 'ks_002', name: '新版测试知识集', status: 'draft', docCount: 1, mountedAgents: ['测试 Agent B'] },
    { id: 'ks_003', name: '禁忌话术库', status: 'disabled', docCount: 2, mountedAgents: [] },
  ],
  knowledgeDocs: [
    { id: 'kd_001', title: '本地生活内容 SOP', status: 'indexed', setId: 'ks_001', size: '42 KB', updatedAt: '2025-04-20' },
    { id: 'kd_002', title: '小红书禁忌词清单', status: 'indexing', setId: 'ks_002', size: '8 KB', updatedAt: '2025-04-26' },
    { id: 'kd_003', title: '抖音平台规则 2025', status: 'failed', setId: 'ks_001', size: '156 KB', updatedAt: '2025-04-25', error: '文件解析超时，请检查文件格式后重试' },
    { id: 'kd_004', title: '门店成交异议模板', status: 'indexed', setId: 'ks_001', size: '28 KB', updatedAt: '2025-04-18' },
    { id: 'kd_005', title: '禁忌话术示例库', status: 'indexed', setId: 'ks_003', size: '15 KB', updatedAt: '2025-04-10' },
    { id: 'kd_006', title: '违规内容识别规范', status: 'indexed', setId: 'ks_003', size: '33 KB', updatedAt: '2025-04-10' },
  ],
  merchants: [
    { id: 'mc_001', name: '高老师英语培训', owner: 'user_301', plan: 'plus', status: 'active', credits: 2840, sessions: 47, joinedAt: '2025-01-15' },
    { id: 'mc_002', name: '张三美发连锁', owner: 'user_302', plan: 'free', status: 'active', credits: 120, sessions: 8, joinedAt: '2025-03-02' },
    { id: 'mc_003', name: '李四川菜馆', owner: 'user_303', plan: 'pro', status: 'disabled', credits: 0, sessions: 103, joinedAt: '2024-11-20' },
    { id: 'mc_004', name: '王五健身工作室', owner: 'user_304', plan: 'plus', status: 'active', credits: 1560, sessions: 31, joinedAt: '2025-02-08' },
    { id: 'mc_005', name: '赵六亲子摄影', owner: 'user_305', plan: 'free', status: 'active', credits: 300, sessions: 5, joinedAt: '2025-04-01' },
  ],
  inviteCodes: [
    { id: 'ic_001', code: 'JJ-ALPHA-2025', status: 'active', maxUses: 10, usedCount: 6, channel: '内部测试', expiresAt: '2025-12-31', note: '首批内测用户' },
    { id: 'ic_002', code: 'JJ-KOL-0301', status: 'expired', maxUses: 3, usedCount: 3, channel: 'KOL合作', expiresAt: '2025-03-31', note: 'KOL合作渠道' },
    { id: 'ic_003', code: 'JJ-BETA-0420', status: 'active', maxUses: 50, usedCount: 12, channel: '公开测试', expiresAt: '2025-06-30', note: '4月公测批次' },
    { id: 'ic_004', code: 'JJ-VIP-PRO', status: 'active', maxUses: 5, usedCount: 1, channel: 'Pro合作', expiresAt: '2025-09-30', note: 'Pro版早鸟用户' },
  ],
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  enabled:   'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  active:    'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  draft:     'border-white/15 bg-white/5 text-white/60',
  disabled:  'border-red-500/20 bg-red-900/20 text-red-400',
  indexed:   'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  indexing:  'border-amber-500/30 bg-amber-500/10 text-amber-400',
  failed:    'border-red-500/20 bg-red-900/20 text-red-400',
  archived:  'border-white/10 bg-white/5 text-white/40',
  expired:   'border-white/10 bg-white/5 text-white/40',
  online:    'border-amber-500/40 bg-amber-500/10 text-amber-400',
  free:      'border-white/15 bg-white/5 text-white/55',
  plus:      'border-sky-500/30 bg-sky-500/10 text-sky-400',
  pro:       'border-violet-500/30 bg-violet-500/10 text-violet-400',
};
const STATUS_LABELS = {
  enabled:'已启用', active:'正常', draft:'草稿', disabled:'已禁用',
  indexed:'已索引', indexing:'索引中', failed:'失败', archived:'已归档',
  expired:'已过期', online:'线上', free:'Free', plus:'Plus', pro:'Pro',
};

const StatusBadge = ({ status, label }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-medium border ${STATUS_STYLES[status] || 'border-white/10 bg-white/5 text-white/50'}`}>
    {label || STATUS_LABELS[status] || status}
  </span>
);

// ─── Button ───────────────────────────────────────────────────────────────────
const Btn = ({ variant='secondary', size='sm', children, onClick, disabled, className='' }) => {
  const base = 'inline-flex items-center gap-1.5 rounded-md font-medium transition-all cursor-pointer border text-[10px] uppercase tracking-widest';
  const sz = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const v = {
    primary:   'bg-amber-600/80 hover:bg-amber-600 border-amber-600/50 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white',
    ghost:     'bg-transparent border-transparent text-white/40 hover:text-white/80 hover:bg-white/5',
    danger:    'bg-red-900/20 hover:bg-red-900/40 border-red-500/20 text-red-400',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${sz} ${v[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  );
};

// ─── Label ────────────────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <div className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-2">{children}</div>
);

// ─── Input ────────────────────────────────────────────────────────────────────
const Input = ({ value, onChange, placeholder, className='', readOnly }) => (
  <input value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
    className={`w-full bg-[#050505] border border-white/10 rounded-md px-3 py-2 text-sm text-[#e0e0e0] placeholder-white/30 focus:border-amber-500/60 focus:outline-none transition-colors ${className}`} />
);

// ─── Textarea ─────────────────────────────────────────────────────────────────
const Textarea = ({ value, onChange, placeholder, rows=6, mono }) => (
  <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    className={`w-full bg-[#050505] border border-white/10 rounded-md px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-white/30 focus:border-amber-500/60 focus:outline-none transition-colors resize-none leading-relaxed ${mono ? 'font-mono text-xs' : ''}`} />
);

// ─── Select ───────────────────────────────────────────────────────────────────
const Select = ({ value, onChange, options, className='' }) => (
  <select value={value} onChange={onChange}
    className={`bg-[#050505] border border-white/10 rounded-md px-3 py-2 text-sm text-[#e0e0e0] focus:border-amber-500/60 focus:outline-none ${className}`}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// ─── Card Panel ───────────────────────────────────────────────────────────────
const Panel = ({ children, className='' }) => (
  <div className={`bg-[#0d0d0d] border border-white/10 rounded-xl ${className}`}>{children}</div>
);

const PanelHeader = ({ children, className='' }) => (
  <div className={`bg-[#080808] border-b border-white/5 px-5 py-3.5 flex items-center justify-between ${className}`}>{children}</div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = ({ label, action }) => (
  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-xl text-white/40 gap-3">
    <div className="text-xs uppercase tracking-widest">{label}</div>
    {action}
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = ({ title, children, onClose, footer }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-[#0d0d0d] border border-white/15 rounded-2xl w-full max-w-md mx-4 shadow-[0_24px_120px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-sm font-medium text-white">{title}</div>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">{Ico.X(14)}</button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="px-6 pb-5 flex justify-end gap-2">{footer}</div>}
    </div>
  </div>
);

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
const TabBar = ({ tabs, active, onChange }) => (
  <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
    {tabs.map(t => (
      <button key={t.key} onClick={() => onChange(t.key)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          active === t.key
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            : 'text-white/50 hover:text-white/80'
        }`}>{t.label}</button>
    ))}
  </div>
);

// ─── Toast Notification ───────────────────────────────────────────────────────
const Toast = ({ msg, type='success' }) => (
  msg ? (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300
      ${type === 'success' ? 'bg-emerald-900/80 border-emerald-500/30 text-emerald-300' : 'bg-red-900/80 border-red-500/30 text-red-300'}`}>
      {type === 'success' ? Ico.Check(14) : Ico.Alert(14)} {msg}
    </div>
  ) : null
);

// Export everything
Object.assign(window, {
  Ico, Icon, StatusBadge, Btn, Label, Input, Textarea, Select,
  Panel, PanelHeader, EmptyState, Modal, TabBar, Toast, MOCK, STATUS_LABELS,
});
