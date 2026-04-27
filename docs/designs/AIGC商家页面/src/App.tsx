import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { Register } from "./pages/Register";
import { Consultation } from "./pages/Consultation";
import { ArticleWorkbench } from "./pages/ArticleWorkbench";
import { VideoWorkbench } from "./pages/VideoWorkbench";
import { ContentCenter } from "./pages/ContentCenter";
import { ContentDetail } from "./pages/ContentDetail";
import { History } from "./pages/History";
import { HistoryDetail } from "./pages/HistoryDetail";
import { Settings } from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        
        {/* Main layout with sidebar */}
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Consultation />} />
          <Route path="article" element={<ArticleWorkbench />} />
          <Route path="video" element={<VideoWorkbench />} />
          <Route path="content" element={<ContentCenter />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Content detail without sidebar but full width or own layout */}
        <Route path="/content/:id" element={<ContentDetail />} />
        <Route path="/history/:id" element={<HistoryDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
