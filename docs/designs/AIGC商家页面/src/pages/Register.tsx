import { useNavigate } from "react-router-dom";
import { type FormEvent } from "react";

export function Register() {
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-white/10 w-full max-w-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-amber-600/20 text-amber-500 border border-amber-500/40 flex items-center justify-center font-serif font-bold text-2xl italic">
              AI
            </div>
            <h1 className="text-2xl font-serif text-[#e0e0e0] italic tracking-tight">注册并开始使用</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="col-span-1 space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">邮箱</label>
              <input type="email" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="your@email.com" />
            </div>
            <div className="col-span-1 space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">密码</label>
              <input type="password" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="••••••••" />
            </div>
            <div className="col-span-2 space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">邀请码</label>
              <input type="text" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="请输入邀请码" />
            </div>
          </div>

          <div className="border-t border-white/5 pt-8">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 mb-6 font-mono">商家基础信息</h2>
            <div className="grid grid-cols-2 gap-8">
              <div className="col-span-1 space-y-3">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">商家名称</label>
                <input type="text" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="例如：某某普拉提工作室" />
              </div>
              <div className="col-span-1 space-y-3">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">所在城市</label>
                <input type="text" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="例如：杭州" />
              </div>
              <div className="col-span-1 space-y-3">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">联系人</label>
                <input type="text" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="您的姓名" />
              </div>
              <div className="col-span-1 space-y-3">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">联系电话</label>
                <input type="tel" required className="w-full h-12 bg-[#050505] text-[#e0e0e0] px-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30" placeholder="手机号" />
              </div>
              <div className="col-span-2 space-y-3">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-medium">主营服务概述</label>
                <textarea rows={4} required className="w-full bg-[#050505] text-[#e0e0e0] p-4 rounded-md border border-white/10 focus:outline-none focus:border-amber-500 placeholder:text-white/30 resize-none font-serif italic" placeholder="简单描述您的主要服务和产品..."></textarea>
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button type="submit" className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium text-[10px] uppercase tracking-widest rounded-md transition-colors shadow-2xl">
              注册并进入 AI 咨询诊断
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
