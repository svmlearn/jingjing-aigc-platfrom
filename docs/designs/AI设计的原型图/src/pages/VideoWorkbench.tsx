import { useState, type FormEvent } from "react";
import { ArrowLeft, RefreshCw, PenLine, PlayCircle, Send, CheckCircle2, Film, UploadCloud, Loader2, Wand2, Check, Sparkles, X, Clock, PanelRightClose, PanelRightOpen, Target } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export function VideoWorkbench() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const strategy = searchParams.get('strategy') || '转化';

  const [messages, setMessages] = useState([
    { role: "agent", content: `我已经读取了你的策略资产，我们现在要准备明日的视频任务：「沉浸式探店」。当前分配的内容策略是【${strategy}】。为了针对这个目标让脚本更真实，你的门店内有什么特别有辨识度的元素吗？比如落地窗、绿植或者特定的设备？` },
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCanvas, setShowCanvas] = useState(true);
  
  // Upload status for different script segments
  const [uploadStatus, setUploadStatus] = useState<Record<number, 'idle' | 'uploading' | 'done'>>({});

  // Editing Background Task State
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [showEditingModal, setShowEditingModal] = useState(false);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", content: input }]);
    setInput("");
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setMessages(prev => [...prev, { role: "agent", content: "好的，我已经把这些元素融入到了右侧的脚本中了，特别是开头通过落地窗带入阳光的镜头，会显得非常有安全感和温馨。" }]);
      setShowCanvas(true);
    }, 1500);
  };

  const handleUpload = (idx: number) => {
    setUploadStatus(prev => ({ ...prev, [idx]: 'uploading' }));
    setTimeout(() => {
      setUploadStatus(prev => ({ ...prev, [idx]: 'done' }));
    }, 2000);
  };

  const handleStartEditing = () => {
    setIsTaskRunning(true);
    setShowEditingModal(true);
  };

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative">
      {/* Header */}
      <header className="h-14 bg-transparent border-b border-white/10 flex items-center justify-between px-4 shrink-0 relative z-10 w-full">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-md transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <span className="text-xl font-serif text-[#e0e0e0] flex items-center gap-2 tracking-tight">
              视频脚本室
              <span className="bg-white/5 text-white/60 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-sans font-bold">抖音/视频号</span>
              <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold flex items-center gap-1">
                 <Target className="w-3 h-3" />
                 内容策略：{strategy}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded font-mono">
             <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> SYS_AUTH: SUCCESS
          </div>
          <button className="px-4 py-1.5 bg-transparent text-white/60 hover:text-[#e0e0e0] text-[10px] uppercase tracking-widest font-medium rounded transition-colors">
             保存为草稿
          </button>

          {!showCanvas && (
             <button 
               onClick={() => setShowCanvas(true)}
               className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 hover:text-white/80 rounded transition-colors text-[10px] uppercase tracking-widest font-medium"
             >
                <PanelRightOpen className="w-3.5 h-3.5" /> 展开画布
             </button>
          )}

          {isTaskRunning ? (
            <button 
              onClick={() => setShowEditingModal(true)}
              className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded uppercase text-[10px] tracking-widest font-medium transition-colors hover:bg-amber-500/20"
            >
               <Loader2 className="w-3.5 h-3.5 animate-spin" />
               AI 剪辑中 (5-10分钟)
            </button>
          ) : (
            <button 
              onClick={handleStartEditing}
              className="flex items-center gap-2 px-5 py-1.5 bg-amber-600/80 text-white hover:bg-amber-600 rounded uppercase text-[10px] tracking-widest font-medium transition-colors shadow-2xl relative overflow-hidden group"
            >
               <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300"></div>
               <Wand2 className="w-3.5 h-3.5 relative z-10" /> 
               <span className="relative z-10">AI 原片智能剪辑</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat / Input */}
        <div className={`shrink-0 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full overflow-hidden transition-all duration-300 ${showCanvas ? 'w-[450px]' : 'w-[800px] mx-auto border-r-0'}`}>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center ${msg.role === 'agent' ? 'bg-amber-500/20 text-amber-500' : 'bg-white/10 text-white/60'}`}>
                  {msg.role === 'agent' ? <PlayCircle className="w-4 h-4" /> : '商'}
                </div>
                <div className={`p-4 rounded-xl text-sm leading-relaxed ${msg.role === 'agent' ? 'bg-[#0d0d0d] text-[#e0e0e0] rounded-tl-none border border-white/10' : 'bg-amber-600/80 text-white rounded-tr-none'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full flex shrink-0 items-center justify-center bg-amber-500/20 text-amber-500">
                   <PlayCircle className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-xl text-sm bg-[#0d0d0d] text-white/40 rounded-tl-none border border-white/10 flex items-center gap-2 font-serif italic">
                   <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                   Updating Projection...
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 bg-[#0a0a0a] shrink-0">
            <form onSubmit={handleSend} className="relative">
              <textarea
                className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3 min-h-[64px] max-h-32 focus:outline-none focus:border-amber-500 resize-none text-sm placeholder:text-white/30 text-white"
                placeholder="可以直接告诉顾问修改意见..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button 
                type="submit" 
                disabled={isGenerating || !input.trim()}
                className="absolute right-3 bottom-3 h-8 w-8 shrink-0 bg-amber-600/80 hover:bg-amber-600 text-white rounded flex items-center justify-center transition-colors shadow-2xl disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right: Script Preview & Upload */}
        {showCanvas && (
          <div className="flex-1 bg-transparent p-6 lg:p-8 overflow-hidden flex justify-center h-full animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="w-full max-w-5xl bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="bg-[#050505] text-[#e0e0e0] px-8 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4">
                    <h2 className="text-sm font-serif font-medium leading-relaxed bg-white/5 border border-white/10 px-3 py-1.5 rounded max-w-lg truncate">
                       沉浸式探店：发现宝藏普拉提工作室
                    </h2>
                    <div className="h-4 w-px bg-white/10 hidden sm:block"></div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-sans flex items-center gap-3">
                      <span>时长: 45秒</span>
                      <span>场景: 门店实景</span>
                    </p>
                 </div>
                 <div className="flex items-center gap-2">
                   <button className="text-white/30 hover:text-amber-500 p-2 transition-colors border border-transparent hover:border-amber-500/20 hover:bg-amber-500/5 rounded-md">
                      <PenLine className="w-4 h-4" />
                   </button>
                   <button onClick={() => setShowCanvas(false)} className="text-white/30 hover:text-white p-2 transition-colors border border-transparent rounded-md">
                      <PanelRightClose className="w-4 h-4" />
                   </button>
                 </div>
              </div>
              
              <div className="flex-1 p-8 overflow-y-auto">
               <div className="border border-white/5 rounded-xl bg-[#080808]">
                 <div className="grid grid-cols-12 bg-[#050505] border-b border-white/10 font-bold text-white/40 text-[10px] uppercase tracking-widest rounded-t-xl">
                   <div className="col-span-2 p-4 border-r border-white/10 text-center">时长</div>
                   <div className="col-span-3 p-4 border-r border-white/10">画面/镜头要求</div>
                   <div className="col-span-4 p-4 border-r border-white/10">台词/音效</div>
                   <div className="col-span-3 p-4 text-center">分段素材直传</div>
                 </div>
                 
                 {/* Segment 1 */}
                 <div className="grid grid-cols-12 border-b border-white/5 group hover:bg-white/[0.02] transition-colors relative">
                   <div className="col-span-2 p-5 border-r border-white/5 flex flex-col items-center justify-center text-white/60 font-medium font-mono text-xs">
                     00:00 - 00:05
                     <span className="mt-3 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] px-2 py-1 rounded uppercase tracking-wider">Hook</span>
                   </div>
                   <div className="col-span-3 p-5 border-r border-white/5 text-[#e0e0e0] font-serif leading-relaxed text-sm">
                     <p className="font-bold mb-2 text-amber-500/80 font-sans text-[10px] uppercase tracking-widest">【远景推近】</p>
                     从大落地窗外推入室内，阳光洒在地板上。镜头迅速聚焦到门口的指引牌上（不用人出镜）。
                   </div>
                   <div className="col-span-4 p-5 border-r border-white/5 text-[#e0e0e0] font-serif text-sm leading-relaxed whitespace-pre-wrap">
                     “姐妹们，终于在杭州被我挖到了一家不仅巨出片，而且隐私性无敌的宝藏普拉提馆！”
                     <p className="text-[10px] text-emerald-400/60 font-mono mt-4 leading-relaxed tracking-wider">♫ 纯音乐 (Fade in)</p>
                   </div>
                   <div className="col-span-3 p-5 flex items-center justify-center">
                     {uploadStatus[0] === 'done' ? (
                       <div className="w-full relative group/vid cursor-pointer">
                          <div className="aspect-video bg-[#050505] border border-amber-500/40 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
                            <Film className="w-6 h-6 text-amber-500/80" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/vid:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                              <span className="text-[10px] text-white uppercase tracking-widest border border-white/20 px-3 py-1 rounded">可重新上传</span>
                            </div>
                          </div>
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check className="w-3 h-3 text-[##0a0a0a]" />
                          </div>
                       </div>
                     ) : uploadStatus[0] === 'uploading' ? (
                       <div className="w-full aspect-video border border-amber-500/30 bg-amber-500/5 border-dashed rounded-lg flex flex-col items-center justify-center text-amber-500 gap-2">
                         <Loader2 className="w-5 h-5 animate-spin" />
                         <span className="text-[10px] uppercase tracking-widest font-mono">Uploading..</span>
                       </div>
                     ) : (
                       <button onClick={() => handleUpload(0)} className="w-full aspect-video border border-white/10 hover:border-amber-500/40 border-dashed rounded-lg flex flex-col items-center justify-center text-white/30 hover:text-amber-500 transition-all gap-2 bg-[#050505] hover:bg-amber-500/5 group/btn">
                         <UploadCloud className="w-5 h-5 group-hover/btn:-translate-y-1 transition-transform" />
                         <span className="text-[10px] uppercase tracking-widest text-center px-2 font-medium">传关联镜头</span>
                       </button>
                     )}
                   </div>
                 </div>

                 {/* Segment 2 */}
                 <div className="grid grid-cols-12 border-b border-white/5 group hover:bg-white/[0.02] transition-colors relative">
                   <div className="col-span-2 p-5 border-r border-white/5 flex flex-col items-center justify-center text-white/60 font-medium font-mono text-xs">
                     00:05 - 00:25
                     <span className="mt-3 bg-white/5 text-white/60 border border-white/10 text-[9px] px-2 py-1 rounded uppercase tracking-wider">Body</span>
                   </div>
                   <div className="col-span-3 p-5 border-r border-white/5 text-[#e0e0e0] space-y-4 font-serif leading-relaxed text-sm">
                     <div>
                       <p className="font-bold mb-2 text-amber-500/80 font-sans text-[10px] uppercase tracking-widest">【第一视角跟随】</p>
                       推开独立包间门，展示整洁的器械、私密的空间。
                     </div>
                     <div>
                       <p className="font-bold mb-2 text-amber-500/80 font-sans text-[10px] uppercase tracking-widest">【特写】</p>
                       墙上的资质证书（物理治疗师认证）。
                     </div>
                   </div>
                   <div className="col-span-4 p-5 border-r border-white/5 text-[#e0e0e0] font-serif text-sm leading-relaxed whitespace-pre-wrap">
                     “不像外面大班课像下饺子一样。这里全是独立包间，一对一私教。”
                     “而且最打动我的是，这里的教练有医疗背景，产后修复跟着这样的老师练，真的满满的安全感。”
                   </div>
                   <div className="col-span-3 p-5 flex items-center justify-center">
                     {uploadStatus[1] === 'done' ? (
                       <div className="w-full relative group/vid cursor-pointer">
                          <div className="aspect-video bg-[#050505] border border-amber-500/40 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
                            <Film className="w-6 h-6 text-amber-500/80" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/vid:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                              <span className="text-[10px] text-white uppercase tracking-widest border border-white/20 px-3 py-1 rounded">可重新上传</span>
                            </div>
                          </div>
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check className="w-3 h-3 text-[##0a0a0a]" />
                          </div>
                       </div>
                     ) : uploadStatus[1] === 'uploading' ? (
                       <div className="w-full aspect-video border border-amber-500/30 bg-amber-500/5 border-dashed rounded-lg flex flex-col items-center justify-center text-amber-500 gap-2">
                         <Loader2 className="w-5 h-5 animate-spin" />
                         <span className="text-[10px] uppercase tracking-widest font-mono">Uploading..</span>
                       </div>
                     ) : (
                       <button onClick={() => handleUpload(1)} className="w-full aspect-video border border-white/10 hover:border-amber-500/40 border-dashed rounded-lg flex flex-col items-center justify-center text-white/30 hover:text-amber-500 transition-all gap-2 bg-[#050505] hover:bg-amber-500/5 group/btn">
                         <UploadCloud className="w-5 h-5 group-hover/btn:-translate-y-1 transition-transform" />
                         <span className="text-[10px] uppercase tracking-widest text-center px-2 font-medium">传关联镜头</span>
                       </button>
                     )}
                   </div>
                 </div>

                 {/* Segment 3 */}
                 <div className="grid grid-cols-12 group hover:bg-white/[0.02] transition-colors relative">
                   <div className="col-span-2 p-5 border-r border-white/5 flex flex-col items-center justify-center text-white/60 font-medium font-mono text-xs">
                     00:25 - 00:45
                     <span className="mt-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-2 py-1 rounded uppercase tracking-wider">CTA</span>
                   </div>
                   <div className="col-span-3 p-5 border-r border-white/5 text-[#e0e0e0] font-serif leading-relaxed text-sm">
                     <p className="font-bold mb-2 text-amber-500/80 font-sans text-[10px] uppercase tracking-widest">【固定机位】</p>
                     店长或主理人对镜微笑招手。画面打出文字提示：免费体态评估体验。
                   </div>
                   <div className="col-span-4 p-5 border-r border-white/5 text-[#e0e0e0] font-serif text-sm leading-relaxed whitespace-pre-wrap">
                     “拒绝身材焦虑，找回自己最好的状态。”
                     “还在犹豫怎么迈出第一步的妈妈们，左下角给你们准备了专属福利，先来做个体态评估吧~”
                   </div>
                   <div className="col-span-3 p-5 flex items-center justify-center">
                     {uploadStatus[2] === 'done' ? (
                       <div className="w-full relative group/vid cursor-pointer">
                          <div className="aspect-video bg-[#050505] border border-amber-500/40 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
                            <Film className="w-6 h-6 text-amber-500/80" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/vid:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                              <span className="text-[10px] text-white uppercase tracking-widest border border-white/20 px-3 py-1 rounded">可重新上传</span>
                            </div>
                          </div>
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check className="w-3 h-3 text-[##0a0a0a]" />
                          </div>
                       </div>
                     ) : uploadStatus[2] === 'uploading' ? (
                       <div className="w-full aspect-video border border-amber-500/30 bg-amber-500/5 border-dashed rounded-lg flex flex-col items-center justify-center text-amber-500 gap-2">
                         <Loader2 className="w-5 h-5 animate-spin" />
                         <span className="text-[10px] uppercase tracking-widest font-mono">Uploading..</span>
                       </div>
                     ) : (
                       <button onClick={() => handleUpload(2)} className="w-full aspect-video border border-white/10 hover:border-amber-500/40 border-dashed rounded-lg flex flex-col items-center justify-center text-white/30 hover:text-amber-500 transition-all gap-2 bg-[#050505] hover:bg-amber-500/5 group/btn">
                         <UploadCloud className="w-5 h-5 group-hover/btn:-translate-y-1 transition-transform" />
                         <span className="text-[10px] uppercase tracking-widest text-center px-2 font-medium">传关联镜头</span>
                       </button>
                     )}
                   </div>
                 </div>
               </div>
               
               <div className="mt-8 bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start gap-4">
                 <div className="bg-amber-500/20 text-amber-500 p-2 rounded-lg shrink-0">
                    <Sparkles className="w-5 h-5" />
                 </div>
                 <div>
                    <h4 className="text-sm font-medium text-[#e0e0e0] font-serif mb-1">AI 一键剪辑提示</h4>
                    <p className="text-xs text-white/60 leading-relaxed font-serif">当您在上方每一个片段模块中上传了对应的镜头跑片，点击页面右上角的「AI 一键剪辑」，智能混剪引擎会自动按照脚本顺序、添加符合风格的配乐和无缝转场，直接合成导出最终成片。</p>
                 </div>
               </div>

            </div>
          </div>
        </div>
        )}
      </div>

      {/* Editing Task Modal Overlay */}
      {showEditingModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center justify-center p-8 relative overflow-hidden">
             
             {/* Simple Top Loading Progress Bar effect */}
             <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
                <div className="h-full bg-amber-500 w-1/3 animate-pulse"></div>
             </div>

             <button 
               onClick={() => setShowEditingModal(false)}
               className="absolute top-4 right-4 text-white/30 hover:text-white/80 transition-colors p-2"
             >
               <X className="w-5 h-5" />
             </button>

             <div className="relative w-24 h-24 mt-4 mb-8 flex items-center justify-center">
                {/* Rotating rings */}
                <div className="absolute inset-0 border-[3px] border-amber-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-[3px] border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                {/* Pulsing center icon */}
                <Film className="w-8 h-8 text-amber-500 animate-pulse" />
             </div>

             <h3 className="text-xl font-serif text-[#e0e0e0] mb-3">AI 正在混剪当前脚本素材...</h3>
             <p className="text-sm text-center text-white/50 leading-relaxed font-serif px-4">
               引擎正在进行自动镜头对位、人声字幕提取以及卡点配乐匹配操作。
             </p>

             <div className="mt-8 flex items-center text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-mono shadow-inner">
               <Clock className="w-3.5 h-3.5 mr-2" />
               预计等待时长：5 - 10 分钟
             </div>

             <button 
               onClick={() => setShowEditingModal(false)}
               className="mt-8 w-full py-3 bg-white/5 hover:bg-white/10 text-white/60 text-xs rounded transition-colors uppercase tracking-widest font-medium border border-white/5"
             >
               收起弹窗，让其在后台运行
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
