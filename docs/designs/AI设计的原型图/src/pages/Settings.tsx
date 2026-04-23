import { useState } from "react";
import { CheckCircle2, Save, Store, Tag, Users, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "basic", label: "基本属性信息", icon: Store, desc: "账号信息、基础资料设定" },
  { id: "brand", label: "品牌定位矩阵", icon: Tag, desc: "Slogan、品牌调性把控" },
  { id: "products", label: "产品与服务体系", icon: Zap, desc: "核心主推服务与价格带" },
  { id: "audience", label: "目标客群特征", icon: Users, desc: "核心用户画像、痛点场景" },
  { id: "marketing", label: "营销转化目标", icon: Target, desc: "主攻平台、预期效果" },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState("basic");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  };

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative">
      <header className="h-16 bg-transparent border-b border-white/10 flex items-center justify-between px-8 shrink-0">
        <div>
           <h1 className="text-xl font-serif text-[#e0e0e0] italic tracking-tight">商家基本信息设置</h1>
           <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Merchant Profile Settings</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-600/80 text-white hover:bg-amber-600 rounded uppercase text-[10px] tracking-widest font-medium transition-colors shadow-2xl disabled:opacity-50"
        >
          {isSaving ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {isSaving ? "已保存" : "保存全量设置"}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Settings Navigation */}
        <div className="w-64 bg-[#0a0a0a] border-r border-white/10 p-6 flex flex-col gap-2 shrink-0 overflow-y-auto">
           <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-4 px-2">设置模块分类</h3>
           {TABS.map((tab) => {
             const Icon = tab.icon;
             const isActive = activeTab === tab.id;
             return (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={cn(
                   "w-full text-left p-3 rounded-xl transition-all border flex items-start gap-3",
                   isActive 
                     ? "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-lg" 
                     : "bg-transparent border-transparent hover:bg-white/5 text-white/60 hover:text-white/80"
                 )}
               >
                 <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                 <div>
                    <div className="text-sm font-medium">{tab.label}</div>
                    <div className={cn("text-[9px] mt-1 leading-tight", isActive ? "text-amber-500/60" : "text-white/30")}>
                      {tab.desc}
                    </div>
                 </div>
               </button>
             );
           })}
        </div>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-12 bg-transparent">
           <div className="max-w-2xl">
              {activeTab === "basic" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="text-2xl font-serif text-[#e0e0e0] flex items-center gap-3">
                    <Store className="w-6 h-6 text-amber-500" /> 基本属性信息
                  </h2>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">店铺/商家名称</label>
                      <input type="text" defaultValue="杭州 XXX 精品普拉提" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">所在城市及具体位置</label>
                      <input type="text" defaultValue="浙江省杭州市西湖区XX街道XX大厦" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">经营面积与规模</label>
                      <input type="text" defaultValue="300平米，全独立包间" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "brand" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="text-2xl font-serif text-[#e0e0e0] flex items-center gap-3">
                    <Tag className="w-6 h-6 text-amber-500" /> 品牌定位矩阵
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">品牌 Slogan</label>
                      <input type="text" defaultValue="拒绝身材焦虑，找回自己最好的状态" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">整体调性与人设风格</label>
                      <textarea defaultValue="专业且温馨，像闺蜜一样陪伴。带有一点医疗康复背景的专业感，但不冰冷。" rows={3} className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none resize-none" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "products" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="text-2xl font-serif text-[#e0e0e0] flex items-center gap-3">
                    <Zap className="w-6 h-6 text-amber-500" /> 产品与服务体系
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">核心主推课程</label>
                      <textarea defaultValue="1. 产后核心修复与骨盆底肌恢复私教&#10;2. 职场白领肩颈理疗与体态调整纠正&#10;3. 减脂塑形核心普拉提" rows={4} className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none resize-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">客单价范围与体验卡设置</label>
                      <input type="text" defaultValue="体验课 99元起；私教正价 400-600元/节" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "audience" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="text-2xl font-serif text-[#e0e0e0] flex items-center gap-3">
                    <Users className="w-6 h-6 text-amber-500" /> 目标客群特征
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">核心目标用户画像</label>
                      <textarea defaultValue="- 产后妈妈（28-35岁）：因为生育导致漏尿、腹直肌分离，急需恢复核心功能。&#10;- 职场干练女性（25-35岁）：长期久坐导致富贵包、猥琐颈，希望提升仪态气质。" rows={4} className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none resize-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">用户的抗拒点/顾虑点</label>
                      <input type="text" defaultValue="怕大课教练顾不来易受伤；怕隐私性差遇到男士尴尬。" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "marketing" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <h2 className="text-2xl font-serif text-[#e0e0e0] flex items-center gap-3">
                    <Target className="w-6 h-6 text-amber-500" /> 营销转化目标
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">当前主要营销渠道</label>
                      <div className="flex gap-3 mb-2">
                        <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 text-xs">小红书主攻</span>
                        <span className="px-3 py-1 bg-white/5 text-white/60 rounded border border-white/10 text-xs">抖音视频号辅助</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2">阶段性转化目标</label>
                      <input type="text" defaultValue="提升小红书笔记的私信引流率，引导到店完成 99 元体态免费评估。" className="w-full bg-[#050505] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#e0e0e0] focus:border-amber-500 outline-none" />
                    </div>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
