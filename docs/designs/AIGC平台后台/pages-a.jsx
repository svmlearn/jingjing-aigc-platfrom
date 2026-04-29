
// ─── Overview Page ────────────────────────────────────────────────────────────
const OverviewPage = () => {
  const stats = [
    { label: '商户总数', value: '5', sub: '+2 本月新增', color: 'text-white' },
    { label: '线上 Agent', value: '1', sub: '初始咨询 Agent', color: 'text-amber-400' },
    { label: '已启用技能', value: '2', sub: '共 4 个技能', color: 'text-emerald-400' },
    { label: '知识文档', value: '6', sub: '3 已索引', color: 'text-sky-400' },
    { label: '本月咨询', value: '194', sub: '较上月 +23%', color: 'text-white' },
    { label: '积分消耗', value: '4,280', sub: '本月累计', color: 'text-violet-400' },
  ];
  const logs = [
    { time: '10:32', user: 'admin', action: '发布 System Prompt', target: '初始咨询 Agent v13', type: 'publish' },
    { time: '09:18', user: 'admin', action: '启用技能', target: '成交异议处理', type: 'enable' },
    { time: '昨天 16:44', user: 'admin', action: '上传知识文档', target: '门店成交异议模板', type: 'upload' },
    { time: '昨天 14:20', user: 'admin', action: '复制 Agent', target: '测试 Agent B', type: 'copy' },
    { time: '昨天 11:05', user: 'admin', action: '禁用商户', target: '李四川菜馆', type: 'disable' },
    { time: '04-24 09:30', user: 'admin', action: '新建知识集', target: '新版测试知识集', type: 'create' },
  ];
  const alerts = [
    { level: 'warning', msg: '抖音平台规则 2025 索引失败，请检查文件格式' },
    { level: 'warning', msg: '旧 Agent v1 已禁用，请确认线上绑定是否正确' },
  ];
  const typeColor = { publish: 'text-amber-400', enable: 'text-emerald-400', upload: 'text-sky-400', copy: 'text-white/60', disable: 'text-red-400', create: 'text-violet-400' };

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">平台管理台</div>
        <h1 className="text-xl font-semibold text-white">总览</h1>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-sm text-amber-300">
              {Ico.Alert(14)} {a.msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <Panel key={i} className="p-5">
            <Label>{s.label}</Label>
            <div className={`text-3xl font-semibold mt-1 mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-xs text-white/40">{s.sub}</div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <PanelHeader>
            <span className="text-[10px] uppercase tracking-widest text-white/40">系统状态</span>
          </PanelHeader>
          <div className="p-5 space-y-3">
            {[
              { label: '线上咨询 Agent', value: '初始咨询 Agent', ok: true },
              { label: 'LLM Runtime', value: 'gpt-4o-mini', ok: true },
              { label: '知识检索', value: '服务正常', ok: true },
              { label: '积分 Gate', value: '已启用', ok: true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-white/50">{r.label}</span>
                <div className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.ok ? Ico.Check(12) : Ico.X(12)}
                  <span className="text-xs">{r.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <span className="text-[10px] uppercase tracking-widest text-white/40">操作日志</span>
            <span className="text-[10px] text-white/30">今日</span>
          </PanelHeader>
          <div className="p-2">
            {logs.map((l, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                <span className="text-[10px] text-white/30 font-mono mt-0.5 w-20 shrink-0">{l.time}</span>
                <span className={`text-xs ${typeColor[l.type]}`}>{l.action}</span>
                <span className="text-xs text-white/40 truncate">{l.target}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── Invite Codes Page ────────────────────────────────────────────────────────
const InviteCodesPage = () => {
  const [codes, setCodes] = React.useState(MOCK.inviteCodes);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ code: '', channel: '', maxUses: '10', expiresAt: '', note: '' });
  const [toast, setToast] = React.useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleCreate = () => {
    if (!form.code.trim()) return;
    setCodes(prev => [...prev, { id: 'ic_new_' + Date.now(), ...form, maxUses: parseInt(form.maxUses)||10, usedCount: 0, status: 'active' }]);
    setShowModal(false);
    setForm({ code: '', channel: '', maxUses: '10', expiresAt: '', note: '' });
    showToast('邀请码已创建');
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">平台管理台</div>
          <h1 className="text-xl font-semibold text-white">邀请码管理</h1>
        </div>
        <Btn variant="primary" onClick={() => setShowModal(true)}>{Ico.Plus(12)} 新建邀请码</Btn>
      </div>

      <Panel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['邀请码','渠道','状态','使用量','过期时间','备注','操作'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-white/40 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                <td className="px-5 py-3 font-mono text-sm text-white/80">{c.code}</td>
                <td className="px-5 py-3 text-sm text-white/55">{c.channel}</td>
                <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-5 py-3 text-sm text-white/55">
                  <span className={c.usedCount >= c.maxUses ? 'text-red-400' : 'text-white/55'}>{c.usedCount}</span>
                  <span className="text-white/30"> / {c.maxUses}</span>
                </td>
                <td className="px-5 py-3 text-sm text-white/55 font-mono text-xs">{c.expiresAt}</td>
                <td className="px-5 py-3 text-sm text-white/40">{c.note}</td>
                <td className="px-5 py-3">
                  <Btn variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(c.code); showToast('已复制'); }}>{Ico.Copy(12)}</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {showModal && (
        <Modal title="新建邀请码" onClose={() => setShowModal(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowModal(false)}>取消</Btn><Btn variant="primary" onClick={handleCreate}>创建</Btn></>}>
          <div className="space-y-4">
            <div><Label>邀请码</Label><Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="JJ-XXXX-0000" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>渠道标签</Label><Input value={form.channel} onChange={e => setForm({...form, channel: e.target.value})} placeholder="内部测试" /></div>
              <div><Label>最大使用次数</Label><Input value={form.maxUses} onChange={e => setForm({...form, maxUses: e.target.value})} placeholder="10" /></div>
            </div>
            <div><Label>过期时间</Label><Input value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})} placeholder="2025-12-31" /></div>
            <div><Label>备注</Label><Input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="备注信息" /></div>
          </div>
        </Modal>
      )}
      <Toast msg={toast} />
    </div>
  );
};

// ─── Merchants Page ───────────────────────────────────────────────────────────
const MerchantsPage = () => {
  const [merchants] = React.useState(MOCK.merchants);
  const [selected, setSelected] = React.useState(null);
  const m = selected ? merchants.find(x => x.id === selected) : null;

  return (
    <div className="p-8 space-y-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">平台管理台</div>
          <h1 className="text-xl font-semibold text-white">商户管理</h1>
        </div>
        <div className="text-xs text-white/30">{merchants.length} 个商户</div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        <Panel className="flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['商户名称','会员档位','状态','积分余额','咨询次数','加入时间'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-white/40 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchants.map(mc => (
                <tr key={mc.id} onClick={() => setSelected(mc.id)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${selected === mc.id ? 'bg-amber-500/5 border-l-2 border-l-amber-500/40' : 'hover:bg-white/3'}`}>
                  <td className="px-5 py-3 text-sm text-white/85 font-medium">{mc.name}</td>
                  <td className="px-5 py-3"><StatusBadge status={mc.plan} /></td>
                  <td className="px-5 py-3"><StatusBadge status={mc.status} /></td>
                  <td className="px-5 py-3 text-sm font-mono text-white/55">{mc.credits.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-white/55">{mc.sessions}</td>
                  <td className="px-5 py-3 text-xs text-white/40 font-mono">{mc.joinedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {m ? (
          <Panel className="w-72 shrink-0 overflow-auto">
            <PanelHeader>
              <span className="text-[10px] uppercase tracking-widest text-white/40">商户详情</span>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white">{Ico.X(12)}</button>
            </PanelHeader>
            <div className="p-5 space-y-5">
              <div>
                <div className="text-base font-semibold text-white mb-1">{m.name}</div>
                <div className="flex gap-2"><StatusBadge status={m.plan} /><StatusBadge status={m.status} /></div>
              </div>
              <div className="space-y-3">
                {[
                  { l: 'Owner ID', v: m.owner },
                  { l: '积分余额', v: m.credits.toLocaleString() + ' 积分' },
                  { l: '咨询次数', v: m.sessions + ' 次' },
                  { l: '加入时间', v: m.joinedAt },
                ].map(r => (
                  <div key={r.l}>
                    <Label>{r.l}</Label>
                    <div className="text-sm text-white/70 font-mono">{r.v}</div>
                  </div>
                ))}
              </div>
              <div className="pt-2 space-y-2">
                <Btn variant="secondary" className="w-full justify-center">
                  查看咨询记录
                </Btn>
                {m.status === 'active'
                  ? <Btn variant="danger" className="w-full justify-center">禁用商户</Btn>
                  : <Btn variant="secondary" className="w-full justify-center">恢复商户</Btn>
                }
              </div>
            </div>
          </Panel>
        ) : (
          <div className="w-72 shrink-0 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-xs text-white/30">
            选择商户查看详情
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Knowledge Management Page ────────────────────────────────────────────────
const KnowledgeManagementPage = () => {
  const [sets, setSets] = React.useState(MOCK.knowledgeSets);
  const [docs, setDocs] = React.useState(MOCK.knowledgeDocs);
  const [selectedSet, setSelectedSet] = React.useState('all');
  const [showUpload, setShowUpload] = React.useState(false);
  const [showNewSet, setShowNewSet] = React.useState(false);
  const [newSetName, setNewSetName] = React.useState('');
  const [uploadForm, setUploadForm] = React.useState({ title: '', setIds: [], file: '' });
  const [toast, setToast] = React.useState({ msg: '', type: 'success' });
  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast({ msg: '' }), 2500); };

  const filteredDocs = selectedSet === 'all' ? docs : docs.filter(d => d.setId === selectedSet);
  const getSetName = id => sets.find(s => s.id === id)?.name || id;

  const handleRetry = (docId) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'indexing' } : d));
    setTimeout(() => { setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'indexed' } : d)); }, 2000);
    showToast('已重新触发索引');
  };

  const handleCreateSet = () => {
    if (!newSetName.trim()) return;
    setSets(prev => [...prev, { id: 'ks_new_' + Date.now(), name: newSetName, status: 'draft', docCount: 0, mountedAgents: [] }]);
    setNewSetName(''); setShowNewSet(false); showToast('知识集已创建');
  };

  const handleUpload = () => {
    if (!uploadForm.title.trim() || uploadForm.setIds.length === 0) {
      showToast('请填写标题并选择至少一个知识集', 'error'); return;
    }
    const newDoc = { id: 'kd_new_' + Date.now(), title: uploadForm.title, status: 'indexing', setId: uploadForm.setIds[0], size: '— KB', updatedAt: new Date().toISOString().slice(0,10) };
    setDocs(prev => [...prev, newDoc]);
    setShowUpload(false); setUploadForm({ title: '', setIds: [], file: '' });
    showToast('知识文档已上传，正在索引');
  };

  const toggleSetId = (id) => {
    setUploadForm(f => ({ ...f, setIds: f.setIds.includes(id) ? f.setIds.filter(x => x !== id) : [...f.setIds, id] }));
  };

  const statusIcon = (s) => ({
    indexed:  <span className="text-emerald-400">{Ico.Check(12)}</span>,
    indexing: <span className="text-amber-400 animate-spin inline-block">{Ico.Refresh(12)}</span>,
    failed:   <span className="text-red-400">{Ico.X(12)}</span>,
  }[s] || null);

  return (
    <div className="p-8 space-y-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">平台管理台</div>
          <h1 className="text-xl font-semibold text-white">知识管理</h1>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={() => setShowNewSet(true)}>{Ico.Plus(12)} 新建知识集</Btn>
          <Btn variant="primary" onClick={() => setShowUpload(true)}>{Ico.Upload(12)} 上传知识</Btn>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Left: Sets */}
        <Panel className="w-56 shrink-0 overflow-auto">
          <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">知识集</span></PanelHeader>
          <div className="p-2">
            <button onClick={() => setSelectedSet('all')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${selectedSet==='all' ? 'bg-amber-500/10 text-amber-400' : 'text-white/55 hover:bg-white/5'}`}>
              全部文档
              <span className="float-right text-xs text-white/30">{docs.length}</span>
            </button>
            {sets.map(s => (
              <button key={s.id} onClick={() => setSelectedSet(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${selectedSet===s.id ? 'bg-amber-500/10 text-amber-400' : 'text-white/55 hover:bg-white/5'}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="truncate pr-1">{s.name}</span>
                  <span className="text-xs text-white/30 shrink-0">{s.docCount}</span>
                </div>
                <StatusBadge status={s.status} />
              </button>
            ))}
          </div>
        </Panel>

        {/* Right: Documents */}
        <Panel className="flex-1 overflow-auto">
          <PanelHeader>
            <span className="text-[10px] uppercase tracking-widest text-white/40">
              {selectedSet === 'all' ? '全部知识文档' : getSetName(selectedSet)}
            </span>
            <span className="text-xs text-white/30">{filteredDocs.length} 篇</span>
          </PanelHeader>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['标题','状态','所属知识集','大小','更新时间','操作'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-white/40 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(d => (
                <tr key={d.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 text-sm text-white/80">{statusIcon(d.status)} {d.title}</div>
                    {d.status === 'failed' && <div className="text-xs text-red-400/70 mt-0.5 pl-5">{d.error}</div>}
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-5 py-3 text-xs text-white/50">{getSetName(d.setId)}</td>
                  <td className="px-5 py-3 text-xs text-white/40 font-mono">{d.size}</td>
                  <td className="px-5 py-3 text-xs text-white/40 font-mono">{d.updatedAt}</td>
                  <td className="px-5 py-3">
                    {d.status === 'failed' && <Btn variant="secondary" size="sm" onClick={() => handleRetry(d.id)}>{Ico.Refresh(12)} 重试</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {showNewSet && (
        <Modal title="新建知识集" onClose={() => setShowNewSet(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowNewSet(false)}>取消</Btn><Btn variant="primary" onClick={handleCreateSet}>创建</Btn></>}>
          <div><Label>知识集名称</Label><Input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="输入知识集名称" /></div>
        </Modal>
      )}

      {showUpload && (
        <Modal title="上传知识文档" onClose={() => setShowUpload(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowUpload(false)}>取消</Btn><Btn variant="primary" onClick={handleUpload}>上传</Btn></>}>
          <div className="space-y-4">
            <div><Label>文档标题</Label><Input value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} placeholder="文档标题" /></div>
            <div>
              <Label>文件</Label>
              <div className="border border-dashed border-white/15 rounded-lg p-6 text-center text-white/40 text-sm cursor-pointer hover:border-white/25 transition-colors">
                {Ico.Upload(16)} <div className="mt-2 text-xs">点击选择文件或粘贴文本</div>
                <div className="text-[10px] mt-1 text-white/25">支持 TXT、MD、PDF、DOCX</div>
              </div>
            </div>
            <div>
              <Label>加入知识集 <span className="text-red-400">*</span></Label>
              <div className="space-y-2">
                {sets.map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 cursor-pointer group">
                    <div onClick={() => toggleSetId(s.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${uploadForm.setIds.includes(s.id) ? 'bg-amber-500 border-amber-500' : 'border-white/20 group-hover:border-white/40'}`}>
                      {uploadForm.setIds.includes(s.id) && Ico.Check(10)}
                    </div>
                    <span className="text-sm text-white/70">{s.name}</span>
                    <StatusBadge status={s.status} />
                  </label>
                ))}
              </div>
              {uploadForm.setIds.length === 0 && <div className="text-xs text-red-400/70 mt-1">请选择至少一个知识集</div>}
            </div>
          </div>
        </Modal>
      )}
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
};

Object.assign(window, { OverviewPage, InviteCodesPage, MerchantsPage, KnowledgeManagementPage });
