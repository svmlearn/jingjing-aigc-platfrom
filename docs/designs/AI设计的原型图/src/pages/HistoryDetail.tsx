import { ArrowLeft, FileText, Video, Calendar as CalendarIcon, CheckCircle2, Download, Copy, Share2, PlayCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

export function HistoryDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  // Mock data fetching based on ID
  // ID 2 -> Video draft, ID 3 -> Video completed, others -> Article draft
  const isVideo = id === '2' || id === '3'; 
  const isCompletedVideo = id === '3';
  const isArticle = !isVideo;
  
  return (
    <div className="flex h-full w-full flex-col bg-transparent relative overflow-y-auto">
      <header className="h-16 bg-[#0a0a0a] border-b border-white/10 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10 w-full">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-serif text-[#e0e0e0] italic">
              {isVideo ? (isCompletedVideo ? "成片导出：沉浸式探店" : "视频脚本：沉浸式探店") : "图文草稿：产后修复误区"}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-[10px] uppercase tracking-widest font-mono">
              <span className="text-white/40">{isVideo ? 'Video Task' : 'Article Task'}</span>
              <span className="text-white/20">|</span>
              <span className="text-amber-500">{isVideo ? '昨天 16:45' : '今天 10:23'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white/5 text-white/80 hover:bg-white/10 text-[10px] uppercase tracking-widest font-medium rounded transition-colors flex items-center gap-2">
            <Copy className="w-3.5 h-3.5" /> 复制内容
          </button>
          <button className="px-4 py-2 bg-amber-600/80 text-white hover:bg-amber-600 text-[10px] uppercase tracking-widest font-medium rounded transition-colors shadow-2xl flex items-center gap-2">
            <Download className="w-3.5 h-3.5" /> {isCompletedVideo ? "下载视频" : "导出文件"}
          </button>
        </div>
      </header>

      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        
        {/* Document Status / Quality Score could go here */}
        <div className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex divide-x divide-white/5">
          <div className="p-6 flex-1 text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-mono">Status</div>
            <div className="text-[#e0e0e0] text-sm font-medium font-serif flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 
              {isVideo ? (isCompletedVideo ? 'AI 成功剪辑完成' : '已生成版脚本') : '待图文排版'}
            </div>
          </div>
          <div className="p-6 flex-1 text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-mono">Platform Match</div>
            <div className="text-amber-500 font-bold text-sm">小红书 & 抖音</div>
          </div>
          <div className="p-6 flex-[2] bg-[#050505]">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-mono">AI Suggestion</div>
            <p className="text-xs text-white/60 font-serif leading-relaxed line-clamp-2">
               内容已根据对标爆款进行逻辑重构，推荐在发布时加上定位信息。
            </p>
          </div>
        </div>

        {/* Video Player Display (only for completed videos) */}
        {isCompletedVideo && (
          <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
             <div className="aspect-video bg-black flex items-center justify-center relative group">
                {/* Simulated video poster and play button */}
                <img src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=1200&h=675" alt="Video cover" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none group-hover:bg-black/40 transition-colors">
                   <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white mb-4">
                     <PlayCircle className="w-8 h-8 fill-white/10" />
                   </div>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-white/20">
                   <div className="h-full bg-amber-500 w-full"></div>
                </div>
             </div>
             <div className="p-4 bg-[#050505] flex items-center justify-between text-xs font-mono text-white/40">
                <span>00:00 / 00:45</span>
                <span>HD 1080p</span>
             </div>
          </section>
        )}

        <section className="bg-[#0d0d0d] rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
          <div className="bg-[#050505] px-8 py-5 border-b border-white/5 flex items-center gap-3">
             {isVideo ? <Video className="w-4 h-4 text-amber-500" /> : <FileText className="w-4 h-4 text-amber-500" />}
             <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/40">{isCompletedVideo ? "参考底层脚本" : "完整内容阅览"}</h2>
          </div>
          <div className="p-8 lg:p-12 text-base font-serif text-[#e0e0e0] leading-loose whitespace-pre-wrap selection:bg-amber-500/20 selection:text-amber-500">
            {isVideo ? `【标题】：姐妹们，终于在杭州发现了一家宝藏普拉提馆！

【时长预估】：45秒
【场景设定】：杭州线下核心商区，带大落地窗的私教空间

00:00 - 00:05 (Hook)
【远景推近】从大落地窗外推入室内，阳光洒在地板上。镜头迅速聚焦到门口的指引牌上。
旁白：“姐妹们，终于在杭州被我挖到了一家不仅巨出片，而且隐私性无敌的宝藏普拉提馆！”
音乐：纯音乐轻快入场

00:05 - 00:25 (Body)
【第一视角跟随】推开独立包间门，展示整洁的器械、私密的空间。
【特写】墙上的资质证书（物理治疗师认证）。
旁白：“不像外面大班课像下饺子一样。这里全是独立包间，一对一私教。而且最打动我的是，这里的教练有医疗背景，产后修复跟着这样的老师练，真的满满的安全感。”

00:25 - 00:45 (CTA)
【固定机位】店长或主理人对镜微笑招手。画面打出文字提示：免费体态评估体验。
旁白：“拒绝身材焦虑，找回自己最好的状态。还在犹豫怎么迈出第一步的妈妈们，左下角给你们准备了专属福利，先来做个体态评估吧~”` 
: `【标题】：你在那疯狂卷腹，肚子还是松？产后修复这3个误区别踩！

很多新手妈妈生完宝宝后，最着急的就是想恢复身材，于是跟着网上的教程疯狂做卷腹。
但你知道吗？如果你的腹直肌分离还没有恢复，盲目卷腹只会让肚子越来越外凸，甚至引发下背部疼痛！

今天就来给大家科普一下，产后修复一定要避开的3个误区：

❌ 误区一：一上来就猛练躯干弯曲动作（仰卧起坐、卷腹）。
✅ 正确做法：应该先从呼吸和深层核心（如腹横肌和骨盆底肌）的唤醒开始。如果你连咳嗽、打喷嚏都会漏尿，千万别去练高强度核心。

❌ 误区二：绑腹带就是为了瘦肚子。
✅ 正确做法：绑腹带主要是为了在产后初期给予松弛的脏器一种承托，防止下垂，对“减脂”毫无用处。长期佩戴反而让核心肌肉“偷懒”失去力量。

❌ 误区三：不管体态，只想要马甲线。
✅ 正确做法：产后妈妈多多少少会有骨盆前倾或者高低肩。先把体态调正了，肉才长在该长的地方！

如果你也困扰自己是不是可以用普通教程锻炼，真的建议先来找专业老师做一次【体态评估】。现在点击下方，可以领取我们的99元新客体验课，私教一对一指导，安全又放心！`}
          </div>
        </section>

      </div>
    </div>
  );
}
