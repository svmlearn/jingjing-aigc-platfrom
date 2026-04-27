import { useState, type FormEvent } from "react";
import { Send, Sparkles, BookOpen, Calendar as CalendarIcon, CheckCircle2, ChevronRight, Edit3, MessageCircle, X, History, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Consultation() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { role: "agent", content: "你好！欢迎来到商家成长平台。我是你的 AI 商业顾问。请先简单聊聊你的产品和服务是什么？" },
    { role: "user", content: "我做的是普拉提私教，在杭州有一个线下门店。" },
    { role: "agent", content: "太棒了，线下普拉提私教是个很好的品类。你的目标客群更偏向哪些人群？比如产后修复、减脂、还是体态调整？" },
    { role: "user", content: "主要是白领女性和产后修复人群。" }
  ]);
  const [input, setInput] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const isReady = true;

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", content: input }]);
    setInput("");
  };

  // Generate some mock calendar data for the month
  const today = new Date();
  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);
  const mockSchedule = {
    3: { type: "article", label: "产后修复误区", strategy: "种草" },
    4: { type: "video", label: "沉浸式探店", strategy: "转化" },
    8: { type: "article", label: "核心激活干货", strategy: "人设" },
    12: { type: "video", label: "教练日常Vlog", strategy: "种草" },
    15: { type: "article", label: "普拉提装备指南", strategy: "转化" },
    22: { type: "video", label: "会员效果展示", strategy: "热点" },
    26: { type: "article", label: "体态自测全攻略", strategy: "热点" },
  };

  const mockHistories = [
    { title: "普拉提春季获客咨询", date: "2026-04-20 14:30" },
    { title: "产后康复卡项设计", date: "2026-04-18 09:15" },
    { title: "教练IP打造讨论", date: "2026-04-10 16:40" },
  ];

  return (
    <div className="flex h-full w-full relative">
      {/* Middle: Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-transparent relative">
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 shrink-0 relative z-10 w-full">
          <div className="flex items-center">
            <h2 className="text-xl font-serif text-white tracking-tight">AI 咨询诊断</h2>
            <div className="ml-4 px-2.5 py-1 bg-amber-500/10 text-amber-500/80 text-[10px] uppercase tracking-widest rounded-full font-medium flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
              梳理中
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setMessages([{ role: "agent", content: "你好！欢迎来到商家成长平台。我是你的 AI 商业顾问。请问今天想要探讨什么新的业务挑战或营销计划？" }]);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 rounded transition-colors text-[10px] uppercase tracking-widest font-medium"
            >
               <Plus className="w-3.5 h-3.5" /> 新开对话
            </button>
            <button 
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80 rounded transition-colors text-[10px] uppercase tracking-widest font-medium"
            >
               <History className="w-3.5 h-3.5" /> 历史对话
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 max-w-2xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center ${msg.role === 'agent' ? 'bg-amber-500/20 text-amber-500' : 'bg-white/10 text-white/60'}`}>
                {msg.role === 'agent' ? <Sparkles className="w-4 h-4" /> : '商'}
              </div>
              <div className={`p-4 rounded-xl text-sm leading-relaxed ${msg.role === 'agent' ? 'bg-[#0d0d0d] text-[#e0e0e0] rounded-tl-none border border-white/10' : 'bg-amber-600/80 text-white rounded-tr-none'}`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 bg-transparent shrink-0">
          <form onSubmit={handleSend} className="relative max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3 min-h-[56px] max-h-32 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none text-sm placeholder:text-white/30 text-white"
              placeholder="告诉我你的问题或补充信息..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button type="submit" className="h-14 w-14 shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-2xl disabled:opacity-50">
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="max-w-3xl mx-auto mt-3 flex gap-2">
            <button className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] text-white/60 hover:bg-white/10 transition-colors uppercase tracking-widest">我们在客流上有瓶颈</button>
            <button className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] text-white/60 hover:bg-white/10 transition-colors uppercase tracking-widest">我不太清楚怎么拍视频</button>
          </div>
        </div>
      </div>

      {/* Right: Strategy Assets */}
      <div className="w-96 shrink-0 bg-[#0a0a0a] border-l border-white/10 flex flex-col h-full overflow-y-auto">
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              我的策略资产
            </h3>
            {isReady && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-medium border border-emerald-500/20 uppercase tracking-widest">
                可执行
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white/5 p-4 rounded-xl shadow-2xl border border-white/5">
              <h4 className="text-[10px] uppercase tracking-widest text-[#e0e0e0] mb-3 flex items-center justify-between">
                产品定位
                <button className="text-white/30 hover:text-amber-500"><Edit3 className="w-3.5 h-3.5" /></button>
              </h4>
              <ul className="text-xs text-white/60 space-y-2">
                <li className="flex gap-2"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16 inline-block">我们是谁</span><span className="font-serif italic text-[#e0e0e0]">杭州精品普拉提工作室</span></li>
                <li className="flex gap-2"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16 inline-block">服务谁</span><span className="font-serif italic text-[#e0e0e0]">白领女性、产后妈妈</span></li>
                <li className="flex gap-2"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16 inline-block">核心场景</span><span className="font-serif italic text-[#e0e0e0]">下班后舒展、产后体态恢复</span></li>
              </ul>
            </div>

            <div className="bg-white/5 p-4 rounded-xl shadow-2xl border border-white/5">
              <h4 className="text-[10px] uppercase tracking-widest text-[#e0e0e0] mb-3 flex items-center justify-between">
                核心卖点卡
                <button className="text-white/30 hover:text-amber-500"><Edit3 className="w-3.5 h-3.5" /></button>
              </h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-white/10 text-[#e0e0e0] rounded text-[10px] tracking-wider border border-white/10">高隐私性独立包间</span>
                <span className="px-2 py-1 bg-white/10 text-[#e0e0e0] rounded text-[10px] tracking-wider border border-white/10">物理治疗师资质</span>
                <span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded text-[10px] tracking-wider border border-amber-500/20 flex items-center gap-1">
                  待发掘...
                </span>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl shadow-2xl border border-white/5">
              <h4 className="text-[10px] uppercase tracking-widest text-[#e0e0e0] mb-3 flex items-center">
                <MessageCircle className="w-4 h-4 mr-1.5 text-white/40" />当前建议
              </h4>
              <p className="text-xs text-white/60 leading-relaxed font-serif italic text-sm">
                当前核心人群明确，但线上获客动作不足。建议优先在「小红书」开展种草内容，建立专业且温馨的门店人设。
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-amber-500" />
              营销内容日历
            </h3>
            <button 
              onClick={() => setShowCalendar(true)}
              className="text-[10px] uppercase tracking-widest text-amber-500 hover:text-amber-400 font-medium"
            >
              查看全部内容
            </button>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={() => navigate("/article?strategy=种草")}
              className="w-full text-left bg-white/5 p-4 rounded-xl shadow-2xl border border-amber-500/20 hover:border-amber-500 hover:shadow-2xl transition-all group hover:bg-amber-500/5 relative"
            >
              <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500 text-black text-[10px] font-bold rounded-bl-lg rounded-tr-lg">
                内容策略：种草
              </div>
              <div className="flex justify-between items-start mb-2 mt-4">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500/20 text-amber-500 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded leading-none">今日</span>
                  <span className="text-sm font-medium text-[#e0e0e0]">图文：产后修复误区</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-amber-500" />
              </div>
              <p className="text-xs text-white/40 mb-3 line-clamp-1 italic font-serif">科普产后修复容易踩的坑，凸显专业性</p>
              <div className="text-[10px] uppercase tracking-widest font-medium text-amber-500 flex items-center gap-1">
                去图文工作台生成 <ChevronRight className="w-3 h-3" />
              </div>
            </button>

            <button 
              onClick={() => navigate("/video?strategy=转化")}
              className="w-full text-left bg-white/5 p-4 rounded-xl shadow-2xl border border-white/5 hover:border-white/20 transition-all group hover:bg-white/10 relative"
            >
              <div className="absolute top-0 right-0 px-3 py-1 bg-white/10 text-white/60 text-[10px] font-bold rounded-bl-lg rounded-tr-lg">
                内容策略：转化
              </div>
              <div className="flex justify-between items-start mb-2 mt-4">
                <div className="flex items-center gap-2">
                  <span className="bg-white/10 text-white/60 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded leading-none">明日</span>
                  <span className="text-sm font-medium text-[#e0e0e0]">视频：沉浸式探店</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60" />
              </div>
              <p className="text-xs text-white/40 italic font-serif">展示门店环境与高隐私性</p>
            </button>
          </div>
          
          <div className="mt-4 flex justify-center">
             <button onClick={() => navigate("/content")} className="text-[10px] uppercase tracking-widest text-white/40 hover:text-amber-500 font-medium underline underline-offset-2">去内容中心找对标素材</button>
          </div>
        </div>
      </div>

      {/* Calendar Full View Modal */}
      {showCalendar && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-serif text-[#e0e0e0] italic">2026年 4月</h2>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2 font-mono">Content Marketing Calendar</p>
              </div>
              <button onClick={() => setShowCalendar(false)} className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              <div className="grid grid-cols-7 gap-4">
                {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                  <div key={day} className="text-center text-[10px] uppercase tracking-widest text-white/40 font-mono mb-2">
                    {day}
                  </div>
                ))}
                
                {/* Empty cells for start of month (e.g. starting on Wednesday) */}
                <div className="aspect-square bg-transparent rounded-xl border border-transparent"></div>
                <div className="aspect-square bg-transparent rounded-xl border border-transparent"></div>
                <div className="aspect-square bg-transparent rounded-xl border border-transparent"></div>
                
                {daysInMonth.map(day => {
                  const schedule = mockSchedule[day as keyof typeof mockSchedule];
                  const isToday = day === 3;
                  
                  return (
                    <div 
                      key={day} 
                      onClick={() => {
                        if (schedule) {
                           navigate(`/${schedule.type}?strategy=${schedule.strategy || '种草'}`);
                        }
                      }}
                      className={`aspect-square p-2 rounded-xl border ${isToday ? 'border-amber-500 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'} hover:border-white/20 transition-colors flex flex-col group relative ${schedule ? 'cursor-pointer' : ''}`}
                    >
                      <span className={`text-sm font-serif ${isToday ? 'text-amber-500' : 'text-white/60'} group-hover:text-white`}>
                        {day}
                      </span>
                      
                      {schedule && (
                        <div className="mt-auto space-y-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-mono ${schedule.type === 'article' ? 'bg-orange-500/20 text-orange-500' : 'bg-blue-500/20 text-blue-400'}`}>
                            {schedule.type === 'article' ? '图文' : '视频'}
                          </span>
                          <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider bg-white/10 text-white/60">
                            {schedule.strategy}
                          </span>
                          <p className="text-[10px] text-[#e0e0e0] leading-tight line-clamp-2 font-serif">
                            {schedule.label}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistory && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="absolute top-0 bottom-0 left-0 w-[400px] bg-[#0a0a0a] border-r border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#050505]">
              <h2 className="text-xl font-serif text-[#e0e0e0] flex items-center gap-2">
                 <History className="w-5 h-5 text-amber-500" />
                 对话记录
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {mockHistories.map((hist, i) => (
                <button
                  key={i}
                  className="w-full text-left p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group flex flex-col gap-2"
                >
                  <span className="text-sm font-serif text-[#e0e0e0] group-hover:text-amber-500 transition-colors">
                    {hist.title}
                  </span>
                  <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">
                    {hist.date}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
