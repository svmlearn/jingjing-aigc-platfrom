import { Outlet, NavLink, useLocation } from "react-router-dom";
import { MessageSquare, FileText, Video, FolderGit2, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "咨询诊断", path: "/", icon: MessageSquare },
  { name: "图文工作台", path: "/article", icon: FileText },
  { name: "视频工作台", path: "/video", icon: Video },
  { name: "内容中心", path: "/content", icon: Library },
  { name: "我的内容", path: "/history", icon: FolderGit2 },
  { name: "商家设置", path: "/settings", icon: Settings },
];

export function MainLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#050505] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0a] border-r border-white/10 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-amber-600 to-amber-200 rotate-45 flex items-center justify-center mr-4">
            <span className="-rotate-45 text-black font-bold text-xs tracking-tighter">AI</span>
          </div>
          <span className="font-serif text-xl italic tracking-tight text-white">AI 咨询工作台</span>
        </div>
        <div className="p-4 space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm group cursor-pointer transition-colors",
                  isActive
                    ? "text-white"
                    : "text-white/60 hover:text-white"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", isActive ? "bg-amber-500" : "bg-transparent group-hover:bg-white/10")} />
                {item.name}
              </NavLink>
            );
          })}
        </div>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 font-medium text-sm">
              商
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white/80">演示商家</span>
              <span className="text-xs text-white/40">旗舰版</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#050505] p-6 lg:p-12 flex flex-col h-screen overflow-hidden">
        <div className="w-full h-full border border-white/10 rounded-2xl relative bg-[#0d0d0d] shadow-2xl flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
