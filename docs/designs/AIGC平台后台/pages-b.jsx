
// ─── Agent Config Page ────────────────────────────────────────────────────────
const AgentConfigPage = () => {
  const [agents, setAgents] = React.useState(MOCK.agents);
  const [selectedId, setSelectedId] = React.useState('ag_001');
  const [promptTab, setPromptTab] = React.useState('draft');
  const [showCopyModal, setShowCopyModal] = React.useState(false);
  const [copyName, setCopyName] = React.useState('');
  const [showSetOnlineModal, setShowSetOnlineModal] = React.useState(false);
  const [toast, setToast] = React.useState({ msg: '', type: 'success' });
  const [onlineId, setOnlineId] = React.useState('ag_001');

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast({ msg: '' }), 2500); };
  const agent = agents.find(a => a.id === selectedId);

  const handleSaveDraft = () => showToast('草稿已保存');
  const handlePublish = () => {
    if (!agent.promptDraftBody?.trim()) { showToast('System Prompt 不能为空', 'error'); return; }
    showToast('已发布，v13 → active');
  };
  const handleCopy = () => {
    if (!copyName.trim()) { showToast('请输入新 Agent 名称', 'error'); return; }
    const newAgent = { ...agent, id: 'ag_' + Date.now(), name: copyName, status: 'draft', isOnline: false };
    setAgents(prev => [...prev, newAgent]);
    setShowCopyModal(false); setCopyName('');
    setSelectedId(newAgent.id);
    showToast('Agent 已复制，状态为草稿');
  };
  const handleSetOnline = () => {
    if (agent.status === 'draft') { showToast('草稿 Agent 不能设为线上', 'error'); return; }
    setAgents(prev => prev.map(a => ({ ...a, isOnline: a.id === selectedId })));
    setOnlineId(selectedId);
    setShowSetOnlineModal(false);
    showToast('线上咨询 Agent 已切换');
  };

  const skills = MOCK.skills;
  const knowledgeSets = MOCK.knowledgeSets;

  const toggleSkill = (skillId) => {
    setAgents(prev => prev.map(a => a.id === selectedId
      ? { ...a, skills: a.skills.includes(skillId) ? a.skills.filter(s => s !== skillId) : [...a.skills, skillId] }
      : a
    ));
  };
  const toggleKS = (ksId) => {
    setAgents(prev => prev.map(a => a.id === selectedId
      ? { ...a, knowledgeSets: a.knowledgeSets.includes(ksId) ? a.knowledgeSets.filter(s => s !== ksId) : [...a.knowledgeSets, ksId] }
      : a
    ));
  };

  return (
    <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
      {/* Left: Agent List */}
      <div className="w-56 shrink-0 bg-[#080808] border-r border-white/10 flex flex-col">
        <div className="px-4 py-4 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Agent 列表</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {agents.map(a => (
            <button key={a.id} onClick={() => setSelectedId(a.id)}
              className={`w-full text-left px-3 py-3 rounded-xl transition-all mb-1 ${selectedId === a.id ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-white truncate pr-1">{a.name}</span>
                {a.isOnline && <span className="text-[8px] uppercase tracking-widest text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">线上</span>}
              </div>
              <StatusBadge status={a.status} />
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail */}
      {agent && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Agent 配置</div>
                <h2 className="text-lg font-semibold text-white">{agent.name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={agent.status} />
                  {agent.isOnline && <StatusBadge status="online" label="线上服务中" />}
                </div>
              </div>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={() => setShowCopyModal(true)}>{Ico.Copy(12)} 复制 Agent</Btn>
                <Btn variant="secondary" onClick={() => setShowSetOnlineModal(true)} disabled={agent.status === 'draft'}>
                  {Ico.Link(12)} 设为线上
                </Btn>
                <Btn variant="primary" onClick={handleSaveDraft}>{Ico.Check(12)} 保存</Btn>
              </div>
            </div>

            {agent.status === 'disabled' && agent.isOnline && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-500/20 rounded-lg text-sm text-red-400">
                {Ico.Alert(14)} 当前 Agent 已禁用，但仍为线上咨询服务入口，商家端将显示「服务维护中」
              </div>
            )}

            {/* Basic Info */}
            <Panel>
              <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">基础信息</span></PanelHeader>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <Label>Agent ID</Label>
                  <div className="text-xs font-mono text-white/40 bg-[#050505] border border-white/5 rounded px-3 py-2">{agent.id}</div>
                </div>
                <div>
                  <Label>状态</Label>
                  <Select value={agent.status} onChange={e => setAgents(prev => prev.map(a => a.id === selectedId ? {...a, status: e.target.value} : a))}
                    options={[{value:'draft',label:'草稿'},{value:'enabled',label:'已启用'},{value:'disabled',label:'已禁用'}]} />
                </div>
                <div className="col-span-2">
                  <Label>名称</Label>
                  <Input value={agent.name} onChange={e => setAgents(prev => prev.map(a => a.id === selectedId ? {...a, name: e.target.value} : a))} />
                </div>
                <div className="col-span-2">
                  <Label>角色描述</Label>
                  <Input value={agent.role} onChange={e => setAgents(prev => prev.map(a => a.id === selectedId ? {...a, role: e.target.value} : a))} />
                </div>
              </div>
            </Panel>

            {/* System Prompt */}
            <Panel>
              <PanelHeader>
                <span className="text-[10px] uppercase tracking-widest text-white/40">System Prompt</span>
                <div className="flex items-center gap-2">
                  <TabBar tabs={[{key:'draft',label:'草稿'},{key:'active',label:'生效版本'},{key:'history',label:'历史版本'}]}
                    active={promptTab} onChange={setPromptTab} />
                  <Btn variant="secondary" size="sm" onClick={handleSaveDraft}>保存草稿</Btn>
                  <Btn variant="primary" size="sm" onClick={handlePublish}>发布</Btn>
                </div>
              </PanelHeader>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span>当前生效: <span className="text-white/60">{agent.promptVersion}</span></span>
                  {agent.promptDraft && <span>草稿: <span className="text-amber-400">{agent.promptDraft}</span></span>}
                </div>
                {promptTab === 'draft' && (
                  <>
                    <Textarea value={agent.promptDraftBody || ''} rows={10} mono
                      onChange={e => setAgents(prev => prev.map(a => a.id === selectedId ? {...a, promptDraftBody: e.target.value} : a))}
                      placeholder="输入 System Prompt 草稿..." />
                    <div><Label>变更说明</Label><Input placeholder="简要描述本次变更内容" /></div>
                    <div className="text-xs text-white/30">保存草稿不会影响线上，发布后才会生效。</div>
                  </>
                )}
                {promptTab === 'active' && (
                  <div className="bg-[#050505] border border-white/5 rounded-lg p-4 text-sm text-white/60 font-mono whitespace-pre-wrap leading-relaxed">{agent.promptBody}</div>
                )}
                {promptTab === 'history' && (
                  <div className="space-y-2">
                    {[{v:'v11',note:'初版咨询顾问'},{v:'v10',note:'调整角色定义'},{v:'v9',note:'增加反问指令'}].map(h => (
                      <div key={h.v} className="flex items-center justify-between px-4 py-3 bg-white/3 rounded-lg border border-white/5">
                        <span className="font-mono text-xs text-white/50">{h.v} archived</span>
                        <span className="text-xs text-white/40">{h.note}</span>
                        <Btn variant="ghost" size="sm">回滚</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>

            {/* Skills */}
            <Panel>
              <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">挂载技能</span></PanelHeader>
              <div className="p-5 space-y-2">
                {skills.map(sk => {
                  const mounted = agent.skills.includes(sk.id);
                  const depUnmet = sk.dependencies.includes('knowledge_retrieval') && agent.knowledgeSets.length === 0;
                  return (
                    <label key={sk.id} className="flex items-start gap-3 cursor-pointer group p-3 rounded-lg hover:bg-white/3 transition-all">
                      <div onClick={() => toggleSkill(sk.id)} className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-all shrink-0 ${mounted ? 'bg-amber-500 border-amber-500' : 'border-white/20 group-hover:border-white/40'}`}>
                        {mounted && Ico.Check(10)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/80">{sk.name}</span>
                          <StatusBadge status={sk.status} />
                          {depUnmet && mounted && <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">依赖未满足</span>}
                        </div>
                        <div className="text-xs text-white/40 mt-0.5 truncate">{sk.whenToUse}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Panel>

            {/* Knowledge Sets */}
            <Panel>
              <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">挂载知识集</span></PanelHeader>
              <div className="p-5 space-y-2">
                {agent.knowledgeSets.length === 0 && (
                  <div className="text-xs text-amber-400/70 mb-2">⚠ 未挂载任何知识集，Knowledge 服务不会检索平台知识</div>
                )}
                {knowledgeSets.map(ks => {
                  const mounted = agent.knowledgeSets.includes(ks.id);
                  return (
                    <label key={ks.id} className="flex items-center gap-3 cursor-pointer group p-3 rounded-lg hover:bg-white/3 transition-all">
                      <div onClick={() => toggleKS(ks.id)} className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${mounted ? 'bg-amber-500 border-amber-500' : 'border-white/20 group-hover:border-white/40'}`}>
                        {mounted && Ico.Check(10)}
                      </div>
                      <span className="text-sm text-white/80 flex-1">{ks.name}</span>
                      <StatusBadge status={ks.status} />
                      <span className="text-xs text-white/30">{ks.docCount} 篇</span>
                    </label>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {showCopyModal && (
        <Modal title="复制 Agent" onClose={() => setShowCopyModal(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowCopyModal(false)}>取消</Btn><Btn variant="primary" onClick={handleCopy}>确认复制</Btn></>}>
          <div className="space-y-4">
            <div className="text-sm text-white/50">原 Agent：<span className="text-white/70">{agent.name}</span></div>
            <div><Label>新 Agent 名称</Label><Input value={copyName} onChange={e => setCopyName(e.target.value)} placeholder="例：测试 Agent C" /></div>
            <div className="bg-white/3 border border-white/5 rounded-lg p-4 text-xs text-white/50 space-y-1">
              <div className="text-white/60 mb-2">将复制：</div>
              <div className="flex items-center gap-2">{Ico.Check(12)} <span>System Prompt</span></div>
              <div className="flex items-center gap-2">{Ico.Check(12)} <span>已挂载技能</span></div>
              <div className="flex items-center gap-2">{Ico.Check(12)} <span>已挂载知识集</span></div>
              <div className="text-white/30 mt-2">不复制：线上绑定、服务启动状态、历史记录</div>
            </div>
          </div>
        </Modal>
      )}

      {showSetOnlineModal && (
        <Modal title="设为线上咨询 Agent" onClose={() => setShowSetOnlineModal(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowSetOnlineModal(false)}>取消</Btn><Btn variant="primary" onClick={handleSetOnline}>确认切换</Btn></>}>
          <div className="space-y-3 text-sm text-white/60">
            <div className="flex items-center gap-2 text-amber-400">{Ico.Alert(14)} 此操作将影响商家端咨询入口</div>
            <div>切换后，商家端将使用 <span className="text-white/80">{agent.name}</span> 提供咨询服务。</div>
            <div>当前线上：<span className="text-white/70">{agents.find(a => a.isOnline)?.name || '未设置'}</span></div>
          </div>
        </Modal>
      )}
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
};

// ─── Skill Management Page ────────────────────────────────────────────────────
const SkillManagementPage = () => {
  const [skills, setSkills] = React.useState(MOCK.skills);
  const [selectedId, setSelectedId] = React.useState('sk_001');
  const [showNew, setShowNew] = React.useState(false);
  const [newForm, setNewForm] = React.useState({ name:'', description:'', whenToUse:'', body:'' });
  const [toast, setToast] = React.useState({ msg:'', type:'success' });
  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast({ msg:'' }), 2500); };

  const skill = skills.find(s => s.id === selectedId);

  const handleCreate = () => {
    if (!newForm.name.trim()) { showToast('请输入技能名称', 'error'); return; }
    const newSk = { ...newForm, id: 'sk_' + Date.now(), status: 'draft', dependencies: [], mountedAgents: [] };
    setSkills(prev => [...prev, newSk]);
    setSelectedId(newSk.id);
    setShowNew(false); setNewForm({ name:'', description:'', whenToUse:'', body:'' });
    showToast('技能已创建');
  };
  const updateField = (field, val) => setSkills(prev => prev.map(s => s.id === selectedId ? {...s, [field]: val} : s));

  return (
    <div className="flex h-full">
      {/* Left */}
      <div className="w-56 shrink-0 bg-[#080808] border-r border-white/10 flex flex-col">
        <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/40">技能列表</div>
          <button onClick={() => setShowNew(true)} className="text-white/40 hover:text-amber-400 transition-colors">{Ico.Plus(14)}</button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {skills.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)}
              className={`w-full text-left px-3 py-3 rounded-xl transition-all mb-1 border ${selectedId === s.id ? 'bg-amber-500/10 border-amber-500/20' : 'hover:bg-white/5 border-transparent'}`}>
              <div className="text-sm font-medium text-white/85 mb-1.5 truncate">{s.name}</div>
              <StatusBadge status={s.status} />
            </button>
          ))}
        </div>
      </div>

      {/* Right */}
      {skill && (
        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">技能管理</div>
              <h2 className="text-lg font-semibold text-white">{skill.name}</h2>
            </div>
            <div className="flex gap-2">
              {skill.status !== 'enabled' && <Btn variant="primary" onClick={() => { updateField('status','enabled'); showToast('技能已启用'); }}>启用</Btn>}
              {skill.status === 'enabled' && <Btn variant="danger" onClick={() => { updateField('status','disabled'); showToast('技能已禁用'); }}>禁用</Btn>}
              <Btn variant="secondary" onClick={() => showToast('已保存')}>{Ico.Check(12)} 保存</Btn>
            </div>
          </div>

          <Panel>
            <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">基础信息</span></PanelHeader>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>名称</Label>
                  <Input value={skill.name} onChange={e => updateField('name', e.target.value)} />
                </div>
                <div>
                  <Label>状态</Label>
                  <Select value={skill.status} onChange={e => updateField('status', e.target.value)}
                    options={[{value:'draft',label:'草稿'},{value:'enabled',label:'已启用'},{value:'disabled',label:'已禁用'}]} />
                </div>
              </div>
              <div>
                <Label>Description（能力描述）</Label>
                <Textarea value={skill.description} rows={2} onChange={e => updateField('description', e.target.value)} placeholder="该技能处理什么场景" />
              </div>
              <div>
                <Label>When to Use（触发条件）</Label>
                <Textarea value={skill.whenToUse} rows={2} onChange={e => updateField('whenToUse', e.target.value)} placeholder="什么情况下 Agent 应该调用该技能" />
              </div>
              {skill.dependencies.length > 0 && (
                <div>
                  <Label>依赖项</Label>
                  <div className="flex gap-2">
                    {skill.dependencies.map(d => (
                      <span key={d} className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">Skill Body（Prompt 正文）</span></PanelHeader>
            <div className="p-5">
              <Textarea value={skill.body} rows={10} mono onChange={e => updateField('body', e.target.value)} placeholder="输入该技能的 prompt 正文..." />
            </div>
          </Panel>

          {skill.mountedAgents.length > 0 && (
            <Panel>
              <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">已挂载 Agent</span></PanelHeader>
              <div className="p-5 flex flex-wrap gap-2">
                {skill.mountedAgents.map(a => (
                  <span key={a} className="text-xs text-white/60 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">{a}</span>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {showNew && (
        <Modal title="新建技能" onClose={() => setShowNew(false)}
          footer={<><Btn variant="secondary" onClick={() => setShowNew(false)}>取消</Btn><Btn variant="primary" onClick={handleCreate}>创建</Btn></>}>
          <div className="space-y-4">
            <div><Label>名称</Label><Input value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})} placeholder="技能名称" /></div>
            <div><Label>Description</Label><Textarea value={newForm.description} rows={2} onChange={e => setNewForm({...newForm, description: e.target.value})} placeholder="能力描述" /></div>
            <div><Label>When to Use</Label><Textarea value={newForm.whenToUse} rows={2} onChange={e => setNewForm({...newForm, whenToUse: e.target.value})} placeholder="触发条件" /></div>
            <div><Label>Body</Label><Textarea value={newForm.body} rows={4} mono onChange={e => setNewForm({...newForm, body: e.target.value})} placeholder="Prompt 正文..." /></div>
          </div>
        </Modal>
      )}
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
};

// ─── Agent Debug Page ─────────────────────────────────────────────────────────
const MOCK_REPLIES = {
  ag_001: [
    { reply: "根据你描述的情况，这个门店的定位需要先想清楚一个核心问题：你的客户是谁，他们为什么要选择你而不是旁边那家？\n\n我建议你先做这三件事：\n\n1. 梳理现有客户画像 — 过去 30 天成交的客户，主要是哪类人？年龄段、消费动机、来源渠道？\n2. 分析 3 个竞品账号 — 同区域同品类的头部账号在发什么？你能做到差异化的切入点在哪？\n3. 确定一个主场景 — 小红书账号不需要面面俱到，先占一个清晰的场景标签。\n\n你现在手头有这三类信息吗？有的话我们可以继续深入分析。",
      meta: { loadedSkills:['门店定位方法'], hits:['本地生活账号定位 SOP §2.3','门店成交异议模板 §引言'], toolSummary:'3 成功 / 0 失败' } },
    { reply: "好，明白了。你说的客群主要是 25-35 岁的职场女性，消费能力中等偏上。\n\n基于这个方向，我建议你的小红书账号走「职场减压 + 精致生活」这个场景标签，而不是泛化的美业账号。\n\n具体来说：内容可以聚焦「下班后一小时的自我修复」这个钩子，比竞品「技术流」内容更有情感共鸣。\n\n接下来想聊发布节奏还是内容结构？",
      meta: { loadedSkills:['门店定位方法','成交异议处理'], hits:['本地生活内容 SOP §1.2'], toolSummary:'2 成功 / 0 失败' } },
    { reply: "发布节奏上，初期建议每周 3-4 篇，不要贪多。\n\n结构上推荐：\n- 周一/四：干货类（技巧、工具、知识）\n- 周三/六：故事类（客户案例、日常记录）\n\n评论区要重点维护，前 1 小时的互动率对推流影响很大。\n\n你目前账号有多少粉丝基础？",
      meta: { loadedSkills:['小红书口吻策略'], hits:['小红书运营 SOP §3'], toolSummary:'1 成功 / 0 失败' } },
  ],
  ag_002: [
    { reply: "（测试 Agent B）收到你的问题，我会基于测试配置进行回复。\n\n请问你的门店当前的主要获客渠道是什么？线上还是线下为主？",
      meta: { loadedSkills:['门店定位方法'], hits:['基础平台知识集 §1'], toolSummary:'2 成功 / 1 失败' } },
    { reply: "了解，线上为主。那小红书和抖音你目前更侧重哪个平台？这会影响内容策略的方向。",
      meta: { loadedSkills:['门店定位方法','小红书口吻策略'], hits:[], toolSummary:'1 成功 / 0 失败' } },
  ],
};

const AgentDebugPage = () => {
  const [selAgent, setSelAgent] = React.useState('ag_001');
  const [selMerchant, setSelMerchant] = React.useState('mc_001');
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [expandedMeta, setExpandedMeta] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const chatRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const replyCountRef = React.useRef(0);

  const agent = MOCK.agents.find(a => a.id === selAgent);
  const merchant = MOCK.merchants.find(m => m.id === selMerchant);

  const handleAgentChange = (id) => {
    if (messages.length > 0) {
      setSessions(prev => [{ id: Date.now(), agentName: agent?.name, count: messages.filter(m=>m.role==='user').length, ts: new Date().toLocaleTimeString() }, ...prev.slice(0,4)]);
    }
    setSelAgent(id); setMessages([]); replyCountRef.current = 0; setExpandedMeta(null);
  };

  const scrollToBottom = () => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; };

  const handleSend = () => {
    if (!input.trim() || running) return;
    const userMsg = { id: Date.now(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setRunning(true);
    setTimeout(scrollToBottom, 50);
    setTimeout(() => {
      const replies = MOCK_REPLIES[selAgent] || MOCK_REPLIES['ag_001'];
      const idx = replyCountRef.current % replies.length;
      replyCountRef.current += 1;
      const r = replies[idx];
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: r.reply, meta: r.meta }]);
      setRunning(false);
      setTimeout(scrollToBottom, 80);
    }, 1200 + Math.random() * 600);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); };

  const handleClear = () => {
    if (messages.length > 0) {
      setSessions(prev => [{ id: Date.now(), agentName: agent?.name, count: messages.filter(m=>m.role==='user').length, ts: new Date().toLocaleTimeString() }, ...prev.slice(0,4)]);
    }
    setMessages([]); replyCountRef.current = 0; setExpandedMeta(null);
  };

  return (
    <div style={{ height: 'calc(100vh - 48px)' }} className="flex">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 border-b border-white/10 bg-[#080808] px-5 py-3 flex items-center gap-4">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1.5">平台管理台 · Agent 调试</div>
            <div className="flex items-center gap-3">
              <Select value={selAgent} onChange={e => handleAgentChange(e.target.value)}
                options={MOCK.agents.map(a => ({ value: a.id, label: a.name + (a.isOnline ? ' [线上]' : '') + ' [' + a.status + ']' }))} />
              <Select value={selMerchant} onChange={e => setSelMerchant(e.target.value)}
                options={MOCK.merchants.map(m => ({ value: m.id, label: m.name }))} />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-[10px] text-white/30 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-md">测试不扣积分 · 不写入咨询历史</div>
            {messages.length > 0 && <Btn variant="ghost" size="sm" onClick={handleClear}>{Ico.Trash(12)} 清空对话</Btn>}
          </div>
        </div>

        <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{background:'#080808'}}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-400">{Ico.Bug(20)}</div>
              <div className="text-sm text-white/50 mb-1">选择 Agent 和测试商家，开始多轮调试</div>
              <div className="text-xs text-white/25 mb-6">每条 AI 回复下方可展开查看本轮配置详情</div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {['我不知道这个门店的小红书账号该怎么定位','客户总说价格太贵，怎么处理？','帮我分析竞品账号的差异化方向'].map(q => (
                  <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
                    className="text-xs text-white/40 border border-white/10 hover:border-amber-500/30 hover:text-amber-400 px-3 py-1.5 rounded-full transition-all">{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={'flex gap-3 ' + (msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={'w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-medium ' + (msg.role === 'user' ? 'bg-white/10 text-white/60' : 'bg-amber-500/15 border border-amber-500/25 text-amber-400')}>
                {msg.role === 'user' ? (merchant?.name?.[0] || 'U') : 'AI'}
              </div>
              <div className={'max-w-[72%] flex flex-col gap-1 ' + (msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ' + (msg.role === 'user' ? 'bg-white/8 text-white/80 rounded-tr-md border border-white/8' : 'bg-[#0d0d0d] border border-white/8 text-white/80 rounded-tl-md')}>
                  {msg.content}
                </div>
                {msg.meta && (
                  <button onClick={() => setExpandedMeta(expandedMeta === msg.id ? null : msg.id)}
                    className="text-[10px] text-white/25 hover:text-amber-400/70 transition-colors flex items-center gap-1 px-1">
                    {Ico.Eye(10)} {expandedMeta === msg.id ? '收起配置详情' : '查看本轮配置详情'}
                  </button>
                )}
                {msg.meta && expandedMeta === msg.id && (
                  <div className="w-full bg-[#0a0a0a] border border-white/8 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-white/30 shrink-0">加载技能</span>
                      {msg.meta.loadedSkills.length > 0 ? msg.meta.loadedSkills.map(s => <span key={s} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">{s}</span>) : <span className="text-white/25">无</span>}
                    </div>
                    {msg.meta.hits.length > 0 && (
                      <div className="flex flex-wrap gap-2 items-start">
                        <span className="text-white/30 shrink-0 mt-0.5">命中知识</span>
                        <div className="flex flex-wrap gap-1">{msg.meta.hits.map((h,i) => <span key={i} className="text-white/45 bg-white/5 border border-white/5 px-2 py-0.5 rounded">{h}</span>)}</div>
                      </div>
                    )}
                    <div className="text-white/30">工具调用 <span className="text-white/50">{msg.meta.toolSummary}</span></div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {running && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full shrink-0 bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center text-xs">AI</div>
              <div className="px-4 py-3 bg-[#0d0d0d] border border-white/8 rounded-2xl rounded-tl-md flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{animationDelay:'0.2s'}} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{animationDelay:'0.4s'}} />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#080808] p-4">
          <div className="flex gap-3 items-end">
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="输入测试消息… (Cmd/Ctrl+Enter 发送)" rows={2}
              className="flex-1 bg-[#050505] border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/25 focus:border-amber-500/40 focus:outline-none resize-none leading-relaxed transition-colors" />
            <button onClick={handleSend} disabled={running || !input.trim()}
              className={'w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ' + (running || !input.trim() ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer')}>
              {running ? <span className="animate-spin">{Ico.Refresh(14)}</span> : Ico.Send(14)}
            </button>
          </div>
          <div className="text-[10px] text-white/20 mt-2 pl-1">{messages.filter(m=>m.role==='user').length} 条消息 · 测试商家：{merchant?.name}</div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="w-52 shrink-0 border-l border-white/10 bg-[#0a0a0a] flex flex-col">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="text-[9px] uppercase tracking-widest text-white/30">历史会话</div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(s => (
              <div key={s.id} className="px-3 py-2.5 rounded-lg bg-white/3 border border-white/5">
                <div className="text-xs text-amber-400/70 truncate">{s.agentName}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{s.count} 轮 · {s.ts}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── System Config Page ───────────────────────────────────────────────────────
const SystemConfigPage = () => {
  const [cfg, setCfg] = React.useState({
    llmModel: 'gpt-4o-mini', llmBaseUrl: 'https://api.openai.com/v1',
    llmApiKey: '••••••••••••••••••••••••',
    embModel: 'text-embedding-3-small',
    freeCredits: '300', plusCredits: '2000', proCredits: '8000',
    creditGate: true, maintenanceMode: false,
  });
  const [toast, setToast] = React.useState('');
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">平台管理台</div>
        <h1 className="text-xl font-semibold text-white">系统配置</h1>
        <div className="text-xs text-white/40 mt-1">平台级运行参数。Agent 配置请前往「Agent 配置」模块。</div>
      </div>

      <Panel>
        <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">LLM Runtime</span></PanelHeader>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>模型</Label>
              <Select value={cfg.llmModel} onChange={e => setCfg({...cfg, llmModel: e.target.value})} className="w-full"
                options={[{value:'gpt-4o-mini',label:'gpt-4o-mini'},{value:'gpt-4o',label:'gpt-4o'},{value:'claude-3-haiku',label:'claude-3-haiku'}]} />
            </div>
            <div><Label>Embedding 模型</Label>
              <Select value={cfg.embModel} onChange={e => setCfg({...cfg, embModel: e.target.value})} className="w-full"
                options={[{value:'text-embedding-3-small',label:'text-embedding-3-small'},{value:'text-embedding-3-large',label:'text-embedding-3-large'}]} />
            </div>
          </div>
          <div><Label>API Base URL</Label><Input value={cfg.llmBaseUrl} onChange={e => setCfg({...cfg, llmBaseUrl: e.target.value})} /></div>
          <div><Label>API Key</Label><Input value={cfg.llmApiKey} onChange={e => setCfg({...cfg, llmApiKey: e.target.value})} /></div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">会员积分默认规则</span></PanelHeader>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[{l:'Free 初始积分',k:'freeCredits'},{l:'Plus 月度积分',k:'plusCredits'},{l:'Pro 月度积分',k:'proCredits'}].map(r => (
              <div key={r.k}><Label>{r.l}</Label><Input value={cfg[r.k]} onChange={e => setCfg({...cfg, [r.k]: e.target.value})} /></div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader><span className="text-[10px] uppercase tracking-widest text-white/40">全局开关</span></PanelHeader>
        <div className="p-5 space-y-4">
          {[
            { l: '积分 Gate', sub: '咨询前校验会员权益与积分余额', k: 'creditGate' },
            { l: '维护模式', sub: '开启后所有商家端咨询显示维护提示', k: 'maintenanceMode' },
          ].map(r => (
            <div key={r.k} className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/80">{r.l}</div>
                <div className="text-xs text-white/40">{r.sub}</div>
              </div>
              <button onClick={() => setCfg(c => ({...c, [r.k]: !c[r.k]}))}
                className={`w-11 h-6 rounded-full transition-all relative border ${cfg[r.k] ? 'bg-amber-500 border-amber-500/60' : 'bg-white/10 border-white/15'}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${cfg[r.k] ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex justify-end">
        <Btn variant="primary" onClick={() => showToast('配置已保存')}>{Ico.Check(12)} 保存配置</Btn>
      </div>
      <Toast msg={toast} />
    </div>
  );
};

Object.assign(window, { AgentConfigPage, SkillManagementPage, AgentDebugPage, SystemConfigPage });
