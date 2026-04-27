import { useState } from "react";
import { Search, Filter, FileText, Video, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const mockHistory = [
  { id: 1, type: "article", title: "图文草稿：产后修复误区", date: "今天 10:23", status: "草稿", summary: "基于对标素材改写的图文，重点突出了诊疗师资质..." },
  { id: 2, type: "video", title: "视频脚本：沉浸式探店", date: "昨天 16:45", status: "已保存", summary: "45秒探店脚本文案，使用了第一视角和黄金钩子..." },
  { id: 3, type: "video", title: "AI 成片：沉浸式探店", date: "昨天 17:05", status: "成片导出", summary: "已完成自动对轨和混剪的探店最终成片，可直接下载发布。" },
];

export function History() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [filterType, setFilterType] = useState<string>('all');

  const filteredHistory = mockHistory.filter(item => filterType === 'all' || item.type === filterType);
  const selectedItem = mockHistory.find(m => m.id === selectedId);

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative">
      <header className="h-16 bg-transparent border-b border-white/10 flex items-center px-6 shrink-0">
        <h1 className="text-xl font-serif italic text-white tracking-tight">我的内容</h1>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: History List */}
        <div className="w-[400px] shrink-0 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full">
          <div className="p-5 border-b border-white/5 space-y-4">
             <div className="flex gap-2 font-mono">
               <button onClick={() => setFilterType('all')} className={cn("px-4 py-2 text-[10px] uppercase tracking-widest font-medium rounded transition-colors", filterType === 'all' ? "bg-white/10 text-white" : "bg-transparent text-white/40 hover:bg-white/5")}>全部</button>
               <button onClick={() => setFilterType('article')} className={cn("px-4 py-2 text-[10px] uppercase tracking-widest font-medium rounded transition-colors", filterType === 'article' ? "bg-orange-500/20 text-orange-500" : "bg-transparent text-orange-500/40 hover:bg-orange-500/10")}>图文库</button>
               <button onClick={() => setFilterType('video')} className={cn("px-4 py-2 text-[10px] uppercase tracking-widest font-medium rounded transition-colors", filterType === 'video' ? "bg-blue-500/20 text-blue-400" : "bg-transparent text-blue-400/40 hover:bg-blue-500/10")}>视频库</button>
             </div>
             <div className="relative">
               <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
               <input type="text" placeholder="Search archive..." className="w-full h-10 pl-11 pr-4 bg-[#050505] border border-white/10 rounded text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-white/30" />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {filteredHistory.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "p-5 rounded-xl cursor-pointer transition-all border",
                  selectedId === item.id 
                     ? "bg-amber-500/10 border-amber-500/40 shadow-2xl"
                     : "bg-white/[0.02] border-white/5 hover:border-white/20"
                )}
              >
                 <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {item.type === 'article' && <FileText className="w-4 h-4 text-orange-500" />}
                      {item.type === 'video' && <Video className="w-4 h-4 text-blue-400" />}
                      <span className="text-base font-serif text-[#e0e0e0]">{item.title}</span>
                    </div>
                 </div>
                 <p className="text-xs text-white/40 line-clamp-2 leading-relaxed font-serif italic mb-3">{item.summary}</p>
                 <span className="text-[10px] text-white/30 font-mono">{item.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: History Detail */}
        <div className="flex-1 bg-transparent p-6 lg:p-12 flex justify-center overflow-y-auto">
          {selectedItem ? (
            <div className="w-full max-w-3xl bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-full">
               <div className="p-8 border-b border-white/5 flex items-start justify-between bg-[#050505]">
                 <div>
                   <div className="flex items-center gap-3 mb-4">
                     <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase font-mono",
                        selectedItem.type === 'article' ? "bg-orange-500/20 border border-orange-500/40 text-orange-500" :
                        "bg-blue-500/20 border border-blue-500/40 text-blue-400"
                     )}>
                       {selectedItem.type === 'article' ? 'Article Task' : 'Video Task'}
                     </span>
                     <span className="text-xs font-mono text-white/30">{selectedItem.date}</span>
                   </div>
                   <h2 className="text-3xl font-serif font-light text-[#e0e0e0]">{selectedItem.title}</h2>
                 </div>
                 
                 <button 
                   onClick={() => navigate(`/history/${selectedItem.id}`)}
                   className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white rounded text-[10px] tracking-widest uppercase font-medium hover:bg-white/20 transition-colors shadow-2xl"
                 >
                   查看详情 <ArrowUpRight className="w-4 h-4" />
                 </button>
               </div>
               
               <div className="p-10 bg-transparent flex-1">
                  {selectedItem.type === 'article' && (
                    <div className="space-y-6">
                       <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">草稿摘要</h3>
                       <div className="bg-white/[0.02] p-8 border border-white/5 rounded-xl text-base font-serif text-[#e0e0e0] whitespace-pre-wrap leading-loose">
很多新手妈妈生完宝宝后，最着急的就是想恢复身材，于是跟着网上的教程疯狂做卷腹。
但你知道吗？如果你的腹直肌分离还没有恢复，盲目卷腹只会让问题越来越严重！

今天就来给大家科普一下，产后修复一定要避开的 3 个误区...
                       </div>
                    </div>
                  )}
                  {selectedItem.type === 'video' && selectedItem.id === 3 && (
                    <div className="space-y-6">
                       <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">成片预览</h3>
                       <div className="bg-white/[0.02] p-8 border border-white/5 rounded-xl">
                          <div className="aspect-video bg-black flex items-center justify-center relative cursor-pointer group rounded-lg overflow-hidden border border-white/10">
                            <img src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=1200&h=675" alt="Video cover" className="w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none group-hover:bg-black/40 transition-colors">
                              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                                <ArrowUpRight className="w-6 h-6 fill-white/10" />
                              </div>
                            </div>
                          </div>
                          <div className="text-center text-xs text-white/30 font-serif italic mt-4">... Tap top-right to view full details and download.</div>
                       </div>
                    </div>
                  )}
                  {selectedItem.type === 'video' && selectedItem.id !== 3 && (
                    <div className="space-y-6">
                       <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">脚本摘要</h3>
                       <div className="bg-white/[0.02] p-8 border border-white/5 rounded-xl space-y-4">
                          <div className="border border-white/10 bg-[#050505] rounded-lg p-5">
                            <span className="text-[10px] uppercase tracking-widest text-amber-500 block mb-2 font-mono">00:00 - 00:05 Hook</span>
                            <span className="text-white/60 block mb-2 font-serif text-sm">【远景推近】从大落地窗外推入室内，阳光洒在地板上。</span>
                            <span className="text-[#e0e0e0] font-serif italic text-base whitespace-pre-wrap">“姐妹们，终于在杭州被我挖到了一家不仅巨出片，而且隐私性无敌的宝藏普拉提馆！”</span>
                          </div>
                          <div className="text-center text-xs text-white/30 font-serif italic mt-4">... Preview truncated. Tap top-right to continue.</div>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm font-serif italic">
               Select an archive record to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
