import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, PenLine, Repeat, Image as ImageIcon, Search, Check, ChevronDown, Layers } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function ArticleWorkbench() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'create' | 'rewrite'>('create');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showMaterialDrawer, setShowMaterialDrawer] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('tab') === 'rewrite') {
      setMode('rewrite');
    }
  }, [location]);

  const handleGenerate = () => {
    setIsGenerating(true);
    setHasError(false);
    setTimeout(() => {
      setIsGenerating(false);
      if (Math.random() > 0.5) setHasError(true);
      else setHasError(false);
    }, 2000);
  };

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative">
      <header className="h-14 bg-transparent border-b border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-md transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <span className="text-xl font-serif text-[#e0e0e0] flex items-center gap-2 tracking-tight">
              图文工作台
              <span className="bg-white/5 text-white/60 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold tracking-wider">小红书</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg">
          <button 
            onClick={() => setMode('create')}
            className={cn("px-3 py-1.5 rounded-md text-xs uppercase tracking-widest font-medium transition-all shadow-2xl", mode === 'create' ? "bg-[#0a0a0a] text-amber-500" : "text-white/40 hover:text-white/80")}
          >
            从 0 到 1 生成
          </button>
          <button 
            onClick={() => setMode('rewrite')}
            className={cn("px-3 py-1.5 rounded-md text-xs uppercase tracking-widest font-medium transition-all shadow-2xl", mode === 'rewrite' ? "bg-[#0a0a0a] text-amber-500" : "text-white/40 hover:text-white/80")}
          >
            基于素材改写
          </button>
        </div>

        <div className="flex items-center gap-2">
           <button className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 text-white/60 text-[10px] uppercase tracking-widest font-medium rounded-md hover:bg-white/5 transition-colors">
             <RefreshCw className="w-4 h-4" /> 重新生成
           </button>
           <button className="px-4 py-1.5 bg-amber-600/80 text-white text-[10px] tracking-widest uppercase font-medium rounded-md hover:bg-amber-600 transition-colors">
             保存到记录
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[400px] shrink-0 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="space-y-3">
               <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">已带入策略</h3>
               <div className="bg-white/5 border border-white/5 rounded-lg p-3 text-xs text-white/60 space-y-2">
                  <div className="flex"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16 mb-1">内容策略</span><span className="font-serif italic text-amber-500 font-bold bg-amber-500/10 border border-amber-500/20 px-2 rounded-sm text-[10px] leading-tight flex items-center justify-center">{new URLSearchParams(location.search).get('strategy') || '种草'}</span></div>
                  <div className="flex"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16">目标受众</span><span className="font-serif italic text-[#e0e0e0]">白领女性、产后妈妈</span></div>
                  <div className="flex"><span className="text-white/30 uppercase tracking-widest text-[10px] w-16">核心卖点</span><span className="font-serif italic text-[#e0e0e0]">高隐私性、物理治疗师资质</span></div>
               </div>
            </div>

            {mode === 'rewrite' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">参考素材</h3>
                  <button 
                    onClick={() => setShowMaterialDrawer(true)}
                    className="text-[10px] tracking-widest text-amber-500 hover:text-amber-400 font-medium uppercase"
                  >
                    更换素材
                  </button>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex gap-3 items-start shadow-2xl">
                  <div className="w-16 h-16 bg-white/5 rounded-md shrink-0 flex items-center justify-center text-white/30">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-serif text-[#e0e0e0] line-clamp-1 mb-1">【爆款】产后必须知道的3个动作</h4>
                    <p className="text-[10px] text-white/40 line-clamp-2">产后千万不要随便做腹部训练，如果腹直肌分离没有恢复，做卷腹只会越来越糟...</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
               <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">内容目标</h3>
               <input type="text" className="w-full text-sm bg-[#050505] text-[#e0e0e0] border border-white/10 rounded-md h-10 px-3 focus:outline-none focus:border-amber-500 font-serif italic" defaultValue="产后修复误区科普，凸显专业性" />
            </div>

            <div className="space-y-3 pt-2">
               <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">平台风格与口吻</h3>
               <div className="flex flex-wrap gap-2">
                 <span className="px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/40 rounded-md text-[10px] tracking-widest uppercase font-medium cursor-pointer">专业干货</span>
                 <span className="px-3 py-1.5 bg-white/5 text-white/60 border border-white/10 hover:border-white/20 rounded-md text-[10px] tracking-widest uppercase font-medium cursor-pointer">知心闺蜜</span>
                 <span className="px-3 py-1.5 bg-white/5 text-white/60 border border-white/10 hover:border-white/20 rounded-md text-[10px] tracking-widest uppercase font-medium cursor-pointer">痛点唤醒</span>
               </div>
            </div>

            <div className="space-y-3 pt-2">
               <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">附加要求</h3>
               <textarea rows={4} className="w-full text-sm bg-[#050505] text-[#e0e0e0] border border-white/10 rounded-md p-3 focus:outline-none focus:border-amber-500 placeholder:text-white/30 font-serif italic" placeholder="例如：字数不要太长，末尾引导预约体验课..."></textarea>
            </div>
            
            <button 
              onClick={handleGenerate}
              className="w-full bg-white/10 hover:bg-white/20 text-[#e0e0e0] font-medium py-3 rounded-md transition-colors flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
              {mode === 'create' ? '生成内容' : '开始改写'}
            </button>
          </div>
        </div>

        <div className="flex-1 bg-transparent p-6 lg:p-12 overflow-y-auto">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 space-y-4">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-sm font-serif italic">Rendering Preview...</p>
            </div>
          ) : hasError ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 space-y-4">
               <div className="w-16 h-16 bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-2 border border-red-500/20">
                 <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
               </div>
               <p className="text-sm tracking-widest uppercase font-medium text-[#e0e0e0]">Sys_Error: Timeout</p>
               <p className="text-sm font-serif text-white/40">Analysis derived from input failed.</p>
               <div className="flex gap-3 mt-4">
                 <button onClick={() => navigate("/")} className="px-5 py-2 bg-white/5 border border-white/10 text-white/60 rounded-md text-[10px] tracking-widest uppercase hover:bg-white/10">Return to Input</button>
                 <button onClick={handleGenerate} className="px-5 py-2 bg-amber-600/80 text-white rounded-md text-[10px] tracking-widest uppercase hover:bg-amber-600 shadow-2xl flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Re-trigger</button>
               </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
               <header className="mb-6">
                 <p className="text-xs text-amber-500/80 mb-2 font-mono">SYS_AUTH: SUCCESS</p>
                 <h3 className="text-4xl font-serif font-light leading-none text-[#e0e0e0]">Generated Draft</h3>
               </header>

               <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-white/5 overflow-hidden">
                 <div className="bg-[#080808] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">标题方案</span>
                    <button className="text-amber-500 text-[10px] tracking-widest uppercase font-medium hover:text-amber-400">换一换</button>
                 </div>
                 <div className="p-6 space-y-3">
                    <div className="p-4 border border-amber-500/40 bg-amber-500/10 rounded-lg text-[#e0e0e0] font-serif text-lg relative pr-8 cursor-pointer">
                      😭 生完顺产3个月了，肚子还是松垮垮的怎么办？
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-500 text-black rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                    <div className="p-4 border border-white/5 hover:border-amber-500/40 hover:bg-amber-500/5 rounded-lg text-white/80 font-serif text-lg cursor-pointer transition-colors">
                      ⚠️ 产后修复千万不要乱练！这份避坑指南请查收
                    </div>
                 </div>
               </div>

               <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-white/5 overflow-hidden flex flex-col min-h-[400px]">
                 <div className="bg-[#080808] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">正文与排版</span>
                 </div>
                 <div className="p-8 flex-1 outline-none text-[#e0e0e0] text-base leading-loose whitespace-pre-wrap font-serif" contentEditable suppressContentEditableWarning>
很多新手妈妈生完宝宝后，最着急的就是想恢复身材，于是跟着网上的教程疯狂做卷腹。
但你知道吗？如果你的腹直肌分离还没有恢复，盲目卷腹只会让问题越来越严重！😱

今天就来给大家科普一下，产后修复一定要避开的 3 个误区：

❌ 误区一：一生完就马上开始高强度运动
✅ 正确做法：顺产后一般建议 42 天、剖腹产 3 个月后，在专业评估下再开始针对性恢复。

❌ 误区二：为了瘦肚子狂做卷腹
✅ 正确做法：先评估腹直肌分离程度，通过专门的呼吸法和深层核心训练来收拢，而不是直接练浅层肌肉！

❌ 误区三：只关注肚子，忽略了盆底肌
✅ 正确做法：盆底肌是承托我们内脏的底座，盆底肌不恢复，做再多腹部运动都容易漏尿或脏器下垂。

💡 在我们 [工作室名称] ，每一位产后妈妈都会先接受物理治疗师的详细评估，在专属的私密包间里，为您定制最安全的恢复方案。

不再盲目焦虑，科学变美。想了解自己的恢复情况？欢迎私信滴滴我，预约一次免费的体态评估吧~ 💕

<span className="text-white/40">#产后修复 #杭州普拉提 #体态调整 #干货分享 #妈妈必看</span>
                 </div>
               </div>
               
               <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-white/5 overflow-hidden">
                 <div className="bg-[#080808] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">配图建议</span>
                    <button 
                      onClick={() => {
                        setIsGeneratingImage(true);
                        setTimeout(() => setIsGeneratingImage(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-[10px] tracking-widest uppercase font-medium rounded transition-colors flex items-center gap-1.5"
                    >
                      {isGeneratingImage ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                      智能生成配图
                    </button>
                 </div>
                 <div className="p-6 text-sm text-white/60 font-serif">
                   <ul className="list-disc pl-4 space-y-4 marker:text-amber-500">
                     <li>封面图：真实痛点场景，例如一位妈妈看着肚子发愁，配合大字标题“别乱练！”</li>
                     <li>图二：对比图，错误卷腹动作打叉 ❌，正确呼吸收核心打钩 ✅</li>
                     <li>图三：工作室高隐私性包间实景照，体现安心感</li>
                   </ul>
                   
                   {/* Dummy generated image area */}
                   <div className="mt-8 grid grid-cols-3 gap-4">
                     {isGeneratingImage ? (
                       <div className="col-span-3 h-32 border border-white/10 border-dashed rounded-lg flex flex-col items-center justify-center gap-2">
                         <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                         <span className="text-[10px] uppercase tracking-widest text-white/40">AI Generative Engine Active...</span>
                       </div>
                     ) : (
                       <>
                         <div className="aspect-[3/4] bg-[#050505] rounded-lg border border-white/10 flex items-center justify-center relative group overflow-hidden">
                           <ImageIcon className="w-6 h-6 text-white/20" />
                           <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-mono text-[9px] text-amber-500 uppercase tracking-widest cursor-pointer">Preview</div>
                         </div>
                         <div className="aspect-[3/4] bg-[#050505] rounded-lg border border-white/10 flex items-center justify-center relative group overflow-hidden">
                           <ImageIcon className="w-6 h-6 text-white/20" />
                           <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-mono text-[9px] text-amber-500 uppercase tracking-widest cursor-pointer">Preview</div>
                         </div>
                         <div className="aspect-[3/4] bg-[#050505] rounded-lg border border-white/10 flex items-center justify-center relative group overflow-hidden">
                           <ImageIcon className="w-6 h-6 text-white/20" />
                           <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-mono text-[9px] text-amber-500 uppercase tracking-widest cursor-pointer">Preview</div>
                         </div>
                       </>
                     )}
                   </div>
                 </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {showMaterialDrawer && (
        <div className="absolute inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-sm">
          <div className="w-[500px] bg-[#0d0d0d] border-l border-white/10 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0">
              <h2 className="text-xl font-serif text-[#e0e0e0]">更换参考素材</h2>
              <button onClick={() => setShowMaterialDrawer(false)} className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white/80 font-medium">取消</button>
            </div>
            <div className="p-6 border-b border-white/5">
               <div className="relative">
                 <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                 <input type="text" placeholder="Search inputs..." className="w-full h-12 pl-12 pr-4 bg-[#050505] border border-white/10 rounded-lg text-sm text-[#e0e0e0] focus:outline-none focus:border-amber-500 placeholder:text-white/30" />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
               {[1, 2, 3].map((item) => (
                 <div key={item} className="border border-white/10 bg-white/[0.02] rounded-xl p-4 flex gap-5 hover:border-amber-500/40 hover:shadow-2xl transition-all cursor-pointer group">
                   <div className="w-20 h-20 bg-white/5 border border-white/5 rounded-lg shrink-0 flex items-center justify-center text-white/40 relative overflow-hidden">
                      <ImageIcon className="w-6 h-6" />
                   </div>
                   <div className="flex-1">
                     <h4 className="text-base font-serif text-[#e0e0e0] line-clamp-1 mb-2 group-hover:text-amber-500 transition-colors">产后三个月，我是如何练回马甲线的？</h4>
                     <p className="text-xs font-serif text-white/40 line-clamp-2 mb-3">这是一篇纯干货记录，没有推销。分享每天必做的5个动作...</p>
                     <div className="flex gap-2">
                       <span className="text-[10px] border border-white/10 bg-white/5 text-white/60 px-2 py-0.5 rounded uppercase tracking-wider">小红书</span>
                       <span className="text-[10px] border border-amber-500/20 bg-amber-500/10 text-amber-500/80 px-2 py-0.5 rounded uppercase tracking-wider">1.2w 点赞</span>
                     </div>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
