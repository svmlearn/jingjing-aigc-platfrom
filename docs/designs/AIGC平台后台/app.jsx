
const NAV = [
  { id: 'overview',   label: '总览',       group: 'main',  icon: (s) => <Icon size={s} d={["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","M9 22V12h6v10"]} /> },
  { id: 'invites',    label: '邀请码管理', group: 'main',  icon: (s) => <Icon size={s} d={["M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z","M9 9h.01","M9 12h.01","M9 15h.01"]} /> },
  { id: 'merchants',  label: '商户管理',   group: 'main',  icon: (s) => <Icon size={s} d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M23 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]} /> },
  { id: 'knowledge',  label: '知识管理',   group: 'main',  icon: (s) => <Icon size={s} d={["M4 19.5A2.5 2.5 0 0 1 6.5 17H20","M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"]} /> },
  { id: 'agent',      label: 'Agent 配置', group: 'agent', icon: (s) => <Icon size={s} d={["M12 2a2 2 0 0 1 2 2v4H10V4a2 2 0 0 1 2-2z","M10 8H6a2 2 0 0 0-2 2v8a6 6 0 0 0 12 0v-8a2 2 0 0 0-2-2h-4","M8 16h.01","M16 16h.01"]} /> },
  { id: 'skills',     label: '技能管理',   group: 'agent', icon: (s) => <Icon size={s} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /> },
  { id: 'debug',      label: 'Agent 调试', group: 'agent', icon: (s) => <Icon size={s} d={["M9 9h.01","M15 9h.01","M3 16l4-4 4 4 4-4 4 4","M12 2a10 10 0 0 1 0 20","M12 2a10 10 0 0 0 0 20"]} /> },
  { id: 'sysconfig',  label: '系统配置',   group: 'system',icon: (s) => <Icon size={s} d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z","M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"]} /> },
];

const PAGE_MAP = {
  overview:  OverviewPage,
  invites:   InviteCodesPage,
  merchants: MerchantsPage,
  knowledge: KnowledgeManagementPage,
  agent:     AgentConfigPage,
  skills:    SkillManagementPage,
  debug:     AgentDebugPage,
  sysconfig: SystemConfigPage,
};

const GROUP_LABELS = { main: '运营管理', agent: 'Agent 能力', system: '系统' };

function App() {
  const [page, setPage] = React.useState(() => localStorage.getItem('jj_admin_page') || 'overview');
  const [tweaksVisible, setTweaksVisible] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem('jj_admin_page', page);
  }, [page]);

  // Tweaks protocol
  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{"accentColor":"#f59e0b","sidebarWidth":224,"density":"normal"}/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const PageComponent = PAGE_MAP[page] || OverviewPage;
  const groups = [...new Set(NAV.map(n => n.group))];

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Avenir Next','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif", background: '#050505' }}>
      {/* Sidebar */}
      <div style={{ width: tweaks.sidebarWidth, background: '#0a0a0a' }}
        className="shrink-0 border-r border-white/10 flex flex-col h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: tweaks.accentColor + '22', border: `1px solid ${tweaks.accentColor}44` }}>
              <div style={{ width: 12, height: 12, background: tweaks.accentColor, borderRadius: 3 }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">静境平台</div>
              <div className="text-[9px] uppercase tracking-widest text-white/30">Admin Console</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto p-3 space-y-4">
          {groups.map(g => (
            <div key={g}>
              <div className="text-[9px] uppercase tracking-widest text-white/25 px-3 mb-1.5">{GROUP_LABELS[g]}</div>
              {NAV.filter(n => n.group === g).map(n => {
                const active = page === n.id;
                return (
                  <button key={n.id} onClick={() => setPage(n.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      active ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                    style={active ? { background: tweaks.accentColor + '18', color: 'white' } : {}}>
                    <span style={active ? { color: tweaks.accentColor } : {}}>{n.icon(15)}</span>
                    {n.label}
                    {active && <div className="ml-auto w-1 h-1 rounded-full" style={{ background: tweaks.accentColor }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">A</div>
            <div>
              <div className="text-xs text-white/60">平台管理员</div>
              <div className="text-[10px] text-white/30">admin@jingjing.ai</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <div className="h-12 border-b border-white/10 bg-[#080808] flex items-center px-6 gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <span>平台管理台</span>
            <span>/</span>
            <span className="text-white/55">{NAV.find(n => n.id === page)?.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-white/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              线上正常
            </div>
            <div className="text-[10px] font-mono text-white/25">v2.2.0</div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto" style={{ background: '#080808' }}>
          <PageComponent />
        </div>
      </div>

      {/* Tweaks Panel */}
      {tweaksVisible && (
        <TweaksPanel onClose={() => {
          setTweaksVisible(false);
          window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
        }}>
          <TweakSection title="主题">
            <TweakColor label="强调色" value={tweaks.accentColor} onChange={v => setTweak('accentColor', v)} />
            <TweakSlider label="侧边栏宽度" value={tweaks.sidebarWidth} min={180} max={280} step={8} onChange={v => setTweak('sidebarWidth', v)} />
          </TweakSection>
          <TweakSection title="布局">
            <TweakRadio label="信息密度" value={tweaks.density} options={['compact','normal','relaxed']} onChange={v => setTweak('density', v)} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
