import { ArrowLeft, MessageSquare, ListTree, PieChart, PenLine } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ContentDetail() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative overflow-y-auto">
      <header className="h-16 bg-[#0a0a0a] border-b border-white/10 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10 w-full">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-serif text-[#e0e0e0] italic">产后必须知道的3个动作，少走弯路！</h1>
            <div className="flex items-center gap-3 mt-1 text-[10px] uppercase tracking-widest font-mono">
              <span className="text-white/40">小红书</span>
              <span className="text-white/20">|</span>
              <span className="text-amber-500 font-bold">1.2w 点赞</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/article')} className="px-5 py-2.5 bg-amber-600/80 text-white text-[10px] uppercase tracking-widest font-medium rounded hover:bg-amber-600 transition-colors shadow-2xl flex items-center gap-2">
            <PenLine className="w-3.5 h-3.5" /> 用它去图文改写
          </button>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto w-full grid grid-cols-12 gap-8">
        
        <div className="col-span-7 space-y-8">
           <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
             <div className="bg-[#050505] px-8 py-5 border-b border-white/5 flex items-center gap-3">
               <ListTree className="w-4 h-4 text-amber-500" />
               <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">内容结构拆解</h2>
             </div>
             <div className="p-8 space-y-6">
               <div className="flex gap-6 group">
                 <div className="w-16 shrink-0 text-xs font-mono font-bold text-amber-500 uppercase tracking-widest pt-1">钩子</div>
                 <div className="flex-1 bg-white/5 p-5 rounded-xl text-[#e0e0e0] font-serif text-base leading-relaxed border border-white/5 group-hover:border-amber-500/40 transition-colors">
                   产后千万不要随便做腹部训练，如果腹直肌分离没有恢复，做卷腹只会越来越糟。
                   <div className="mt-4 text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-2 font-sans">
                     <span className="text-amber-500">洞察：</span>直击痛点，打破常规认知。
                   </div>
                 </div>
               </div>
               
               <div className="flex gap-6 group">
                 <div className="w-16 shrink-0 text-xs font-mono font-bold text-amber-500 uppercase tracking-widest pt-1">干货展开</div>
                 <div className="flex-1 bg-white/5 p-5 rounded-xl text-[#e0e0e0] font-serif text-base leading-relaxed border border-white/5 group-hover:border-amber-500/40 transition-colors">
                   分享了 3 个呼吸和基础核心激活的动作，重点强调了“慢”和“控制”。
                   <div className="mt-4 text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-2 font-sans">
                     <span className="text-amber-500">洞察：</span>操作门槛低，容易被收藏（收藏率高也是这篇爆的原因）。
                   </div>
                 </div>
               </div>

               <div className="flex gap-6 group">
                 <div className="w-16 shrink-0 text-xs font-mono font-bold text-amber-500 uppercase tracking-widest pt-1">转化引导</div>
                 <div className="flex-1 bg-white/5 p-5 rounded-xl text-[#e0e0e0] font-serif text-base leading-relaxed border border-white/5 group-hover:border-amber-500/40 transition-colors">
                   “实在找不到发力感的姐妹，建议找专业老师先带几次建立感觉。”
                   <div className="mt-4 text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-2 font-sans">
                     <span className="text-amber-500">洞察：</span>软性植入线下需求，没有强烈销售感。
                   </div>
                 </div>
               </div>
             </div>
           </section>

           <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
             <div className="bg-[#050505] px-8 py-5 border-b border-white/5">
               <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">原始内容</h2>
             </div>
             <div className="p-8">
                <div className="text-white/60 font-serif text-lg leading-loose whitespace-pre-wrap">
产后千万不要随便做腹部训练，如果腹直肌分离没有恢复，做卷腹只会越来越糟！
今天分享 3 个在家就能做的基础恢复动作，帮助激活深层核心：
... (省略部分文字) ...
实在找不到发力感的姐妹，建议找专业老师先带几次建立感觉，不要盲目加重。
                </div>
             </div>
           </section>
        </div>

        <div className="col-span-5 space-y-8">
           <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
             <div className="bg-[#050505] px-8 py-5 border-b border-white/5 flex items-center gap-3">
               <PieChart className="w-4 h-4 text-emerald-500" />
               <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">评论洞察</h2>
             </div>
             <div className="p-8">
                <div className="flex flex-wrap gap-2 mb-8 font-mono">
                  <span className="px-2.5 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-[9px] uppercase tracking-wider">高频提及：肚子松弛</span>
                  <span className="px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[9px] uppercase tracking-wider">情绪：焦虑/求助</span>
                  <span className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[9px] uppercase tracking-wider">需求：同城线下指导</span>
                </div>
                <p className="text-[#e0e0e0] font-serif text-lg leading-relaxed">
                  这条内容下方的评论主要集中在对自己体态的焦虑上。有很多用户询问具体动作的细节。如果是本土门店号，可以利用这篇爆款的结构，在结尾更强调<span className="text-amber-500">物理治疗师的面诊评估</span>，来接住这部分咨询量。
                </p>
             </div>
           </section>

           <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 flex flex-col h-[500px] overflow-hidden">
             <div className="bg-[#050505] px-8 py-5 border-b border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <MessageSquare className="w-4 h-4 text-white/40" />
                 <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">用户评论精选</h2>
               </div>
               <span className="text-[10px] uppercase text-white/30 tracking-widest font-mono">共 243 条</span>
             </div>
             <div className="p-8 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#e0e0e0]">momo</span>
                    <span className="text-[10px] text-amber-500/80 font-mono">👍 341</span>
                  </div>
                  <p className="text-base text-white/60 font-serif">救命，我都生完一年了做这个还有用吗？</p>
                </div>
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#e0e0e0]">橘子汽水</span>
                    <span className="text-[10px] text-amber-500/80 font-mono">👍 128</span>
                  </div>
                  <p className="text-base text-white/60 font-serif">跟着网上的教程练，腰反而越来越疼了，难道是我发力不对？</p>
                </div>
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#e0e0e0]">小王同学</span>
                    <span className="text-[10px] text-amber-500/80 font-mono">👍 89</span>
                  </div>
                  <p className="text-base text-white/60 font-serif">杭州有推荐的产后恢复机构吗，怕被坑...</p>
                </div>
             </div>
           </section>
        </div>

      </div>
    </div>
  );
}
