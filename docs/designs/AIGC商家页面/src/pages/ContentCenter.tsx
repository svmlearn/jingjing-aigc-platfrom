import { useState, type SVGProps } from "react";
import { Search, Filter, Plus, FileText, Video, ChevronRight, PenLine, ArrowUpRight, X, Link, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const mockMaterials = [
  { id: 1, type: "article", platform: "小红书", title: "产后必须知道的3个动作，少走弯路！", src: "用户上传", likes: "1.2w", desc: "产后千万不要随便做腹部训练，如果腹直肌分离没有恢复，做卷腹只会越来越糟..." },
  { id: 2, type: "video", platform: "抖音", title: "探店杭州最隐秘的普拉提馆，太好出片了", src: "对标库", likes: "5k+", desc: "第一视角沉浸式带你体验，这环境绝绝子..." },
  { id: 3, type: "article", platform: "小红书", title: "物理治疗师教你，如何判断富贵包", src: "对标库", likes: "2w+", desc: "很多人以为脖子后面鼓起来一个包只是胖，其实那可能是..." }
];

export function ContentCenter() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [isEmpty, setIsEmpty] = useState(false);
  
  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFindModal, setShowFindModal] = useState(false);
  
  // Upload state
  const [uploadPlatform, setUploadPlatform] = useState('小红书');
  const [uploadLink, setUploadLink] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  
  // Find state
  const [findPlatform, setFindPlatform] = useState('小红书');
  const [findMethod, setFindMethod] = useState<'keyword'|'profile'>('keyword');
  const [findKeyword, setFindKeyword] = useState('');
  const [findCount, setFindCount] = useState('5');
  const [findProfileUrl, setFindProfileUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const selectedItem = mockMaterials.find(m => m.id === selectedId);

  const handleParse = () => {
    setIsParsing(true);
    setTimeout(() => {
      setIsParsing(false);
      setShowUploadModal(false);
      setUploadLink('');
      // In real life, add to mockMaterials here
    }, 1500);
  };

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setShowFindModal(false);
    }, 1500);
  };

  return (
    <div className="flex h-full w-full flex-col bg-transparent relative">
      <header className="h-16 bg-transparent border-b border-white/10 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-xl font-serif text-[#e0e0e0] italic tracking-tight">内容中心</h1>
        <div className="flex items-center gap-4">
          <button 
             onClick={() => setIsEmpty(!isEmpty)}
             className="text-[10px] text-white/40 uppercase tracking-widest hover:text-amber-500 mr-4 transition-colors"
          >
            Toggle Empty State
          </button>
          <button 
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 rounded uppercase text-[10px] tracking-widest font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 上传素材
          </button>
          <button 
            onClick={() => setShowFindModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 text-white hover:bg-amber-600 rounded uppercase text-[10px] tracking-widest font-medium transition-colors shadow-2xl"
          >
            <Search className="w-3.5 h-3.5" /> 找对标
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-transparent">
          <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-8">
            <LibraryEmptyIcon className="w-10 h-10 text-amber-500/80" />
          </div>
          <h2 className="text-2xl font-serif text-[#e0e0e0] mb-3">Your Library is Empty</h2>
          <p className="text-sm text-white/40 max-w-md text-center mb-10 font-serif italic">
            在这里，你可以管理找到的优秀对标内容，或者上传自己过往的素材。我们将基于你的策略资产，帮你把这些素材变成新的指标增长点。
          </p>
          <div className="flex gap-4">
             <button 
               onClick={() => setShowUploadModal(true)}
               className="px-6 py-3 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 uppercase tracking-widest font-medium rounded transition-colors text-[10px] shadow-2xl"
             >
               本地上传
             </button>
             <button 
               onClick={() => setShowFindModal(true)}
               className="px-6 py-3 bg-amber-600 text-white hover:bg-amber-500 uppercase tracking-widest font-medium rounded transition-colors text-[10px] shadow-2xl"
             >
               去库里找找
             </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-[400px] shrink-0 bg-[#0a0a0a] border-r border-white/10 flex flex-col h-full">
            <div className="p-5 border-b border-white/5 flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="text" placeholder="Search parameters..." className="w-full h-10 pl-10 pr-4 bg-[#050505] border border-white/10 rounded text-xs text-[#e0e0e0] focus:outline-none focus:border-amber-500 placeholder:text-white/30" />
              </div>
              <button className="h-10 w-10 shrink-0 border border-white/10 bg-[#050505] rounded flex items-center justify-center text-white/60 hover:bg-white/5 transition-colors">
                <Filter className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {mockMaterials.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "border border-white/5 bg-white/[0.02] rounded-xl p-4 cursor-pointer transition-all flex gap-4 overflow-hidden",
                    selectedId === item.id 
                       ? "border-amber-500/40 bg-amber-500/10 shadow-2xl"
                       : "hover:border-white/20 hover:shadow-2xl"
                  )}
                >
                  <div className={cn("w-16 h-16 shrink-0 rounded-lg flex items-center justify-center relative overflow-hidden", 
                     selectedId === item.id ? "bg-amber-500/20 text-amber-500" : "bg-white/5 text-white/30")}>
                     {item.type === 'article' ? <FileText className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h3 className="text-sm font-serif text-[#e0e0e0] line-clamp-2 mb-2 leading-snug">{item.title}</h3>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono">
                      <span className="bg-white/5 text-white/60 px-1.5 py-0.5 border border-white/10 rounded">{item.platform}</span>
                      <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">{item.likes} 点赞</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-transparent p-6 lg:p-12 flex flex-col items-center overflow-y-auto">
            {selectedItem ? (
              <div className="w-full max-w-3xl bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-full">
                <div className="p-8 border-b border-white/5 flex items-start justify-between bg-[#050505]">
                  <div className="flex gap-5">
                     <div className="w-14 h-14 shrink-0 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center text-amber-500">
                        {selectedItem.type === 'article' ? <FileText className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                     </div>
                     <div>
                       <h2 className="text-2xl font-serif text-[#e0e0e0] leading-snug mb-3">{selectedItem.title}</h2>
                       <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-mono">
                         <span className="bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded-sm">{selectedItem.platform}</span>
                         <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-sm flex items-center gap-1">👍 {selectedItem.likes}</span>
                         <span className="text-white/30 ml-2">{selectedItem.src}</span>
                       </div>
                     </div>
                  </div>
                  
                  <button 
                    onClick={() => navigate(`/content/${selectedItem.id}`)}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 hover:text-amber-500 font-medium transition-colors"
                  >
                    查看详情 <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="flex-1 p-10 overflow-y-auto">
                   <div className="max-w-none">
                     <p className="text-[#e0e0e0] font-serif leading-loose whitespace-pre-wrap text-base">{selectedItem.desc}</p>
                     <p className="text-white/30 mt-8 text-xs italic font-serif">[ Preview limit reached. Render full breakdown for deep analysis. ]</p>
                   </div>
                </div>

                <div className="p-6 bg-[#050505] border-t border-white/5 flex justify-end gap-3">
                   {selectedItem.type === 'article' ? (
                     <button 
                       onClick={() => navigate('/article?tab=rewrite')}
                       className="px-6 py-2.5 bg-white/10 text-[#e0e0e0] font-medium rounded-lg hover:bg-white/20 transition-colors shadow-2xl flex items-center gap-2 text-[10px] uppercase tracking-widest"
                     >
                        <PenLine className="w-4 h-4" /> Fetch to Workbench
                     </button>
                   ) : (
                     <button 
                       onClick={() => navigate('/video?tab=rewrite')}
                       className="px-6 py-2.5 bg-white/10 text-[#e0e0e0] font-medium rounded-lg hover:bg-white/20 transition-colors shadow-2xl flex items-center gap-2 text-[10px] uppercase tracking-widest"
                     >
                        <Video className="w-4 h-4" /> Fetch to Workbench
                     </button>
                   )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-white/30 text-sm font-serif italic">
                 Awaiting source selection...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload/Import Material Modal */}
      {showUploadModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#050505]">
              <h2 className="text-2xl font-serif text-[#e0e0e0] italic">上传解析素材</h2>
              <button onClick={() => setShowUploadModal(false)} className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">选择平台</label>
                <div className="flex flex-wrap gap-2">
                  {['小红书', '抖音', '微博', '视频号'].map(p => (
                    <button 
                      key={p}
                      onClick={() => setUploadPlatform(p)}
                      className={cn("px-4 py-2 border rounded-md text-[10px] font-medium tracking-widest transition-colors", 
                        uploadPlatform === p 
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-500" 
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80")}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">发布链接</label>
                <div className="relative">
                  <Link className="w-4 h-4 text-white/30 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    value={uploadLink}
                    onChange={(e) => setUploadLink(e.target.value)}
                    placeholder="粘贴链接到这里..." 
                    className="w-full bg-[#050505] text-[#e0e0e0] border border-white/10 rounded-lg pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-amber-500 placeholder:text-white/30 font-serif italic" 
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                   onClick={handleParse}
                   disabled={!uploadLink.trim() || isParsing}
                   className="px-6 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded font-medium text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2 border border-amber-500/20 shadow-2xl"
                >
                  {isParsing && <Search className="w-3.5 h-3.5 animate-spin" />}
                  {isParsing ? '解析中...' : '提交解析'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find Benchmark Modal */}
      {showFindModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#050505]">
              <h2 className="text-2xl font-serif text-[#e0e0e0] italic">找优质对标</h2>
              <button onClick={() => setShowFindModal(false)} className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-8 pt-4 bg-[#050505]">
               <div className="flex border-b border-white/10">
                 <button 
                   onClick={() => setFindMethod('keyword')}
                   className={cn("px-6 py-3 text-xs font-medium uppercase tracking-widest relative transition-colors", findMethod === 'keyword' ? "text-amber-500" : "text-white/40 hover:text-white/80")}
                 >
                   搜关键词找
                   {findMethod === 'keyword' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-500"></span>}
                 </button>
                 <button 
                   onClick={() => setFindMethod('profile')}
                   className={cn("px-6 py-3 text-xs font-medium uppercase tracking-widest relative transition-colors", findMethod === 'profile' ? "text-amber-500" : "text-white/40 hover:text-white/80")}
                 >
                   给博主主页找
                   {findMethod === 'profile' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-500"></span>}
                 </button>
               </div>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">目标平台</label>
                <div className="flex flex-wrap gap-2">
                  {['小红书', '抖音', '微博', '视频号'].map(p => (
                    <button 
                      key={p}
                      onClick={() => setFindPlatform(p)}
                      className={cn("px-4 py-2 border rounded-md text-[10px] font-medium tracking-widest transition-colors", 
                        findPlatform === p 
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-500" 
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80")}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              
              {findMethod === 'keyword' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">搜索关键词</label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-white/30 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        value={findKeyword}
                        onChange={(e) => setFindKeyword(e.target.value)}
                        placeholder="例如：普拉提 产后修复" 
                        className="w-full bg-[#050505] text-[#e0e0e0] border border-white/10 rounded-lg pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-amber-500 placeholder:text-white/30 font-serif italic" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">寻找数量</label>
                    <div className="flex gap-2">
                      {['5', '10', '20'].map(cnt => (
                        <button 
                          key={cnt}
                          onClick={() => setFindCount(cnt)}
                          className={cn("px-5 py-2 border rounded-md text-[10px] font-medium transition-colors font-mono", 
                            findCount === cnt 
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-500" 
                              : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10")}
                        >
                          {cnt} 篇
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-3">博主主页链接</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-white/30 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      value={findProfileUrl}
                      onChange={(e) => setFindProfileUrl(e.target.value)}
                      placeholder="粘贴博主主页链接..." 
                      className="w-full bg-[#050505] text-[#e0e0e0] border border-white/10 rounded-lg pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-amber-500 placeholder:text-white/30 font-serif italic" 
                    />
                  </div>
                  <p className="text-[10px] text-white/40 mt-3 font-serif italic">我们将自动拉取该博主近期数据表现最好的几篇内容。</p>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button 
                   onClick={handleSearch}
                   disabled={(findMethod === 'keyword' && !findKeyword.trim()) || (findMethod === 'profile' && !findProfileUrl.trim()) || isSearching}
                   className="px-6 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded font-medium text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2 border border-amber-500/20 shadow-2xl"
                >
                  {isSearching && <Search className="w-3.5 h-3.5 animate-spin" />}
                  {isSearching ? '找寻中...' : '开始找寻'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function LibraryEmptyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>
    </svg>
  );
}
