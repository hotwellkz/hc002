import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";

import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HouseKitLandingPage } from "@/features/marketing/HouseKitLandingPage";
import { ReportsPage } from "@/features/marketing/ReportsPage";
import { SipHouseDesignSoftwarePage } from "@/features/marketing/SipHouseDesignSoftwarePage";
import { SipPanelCalculatorPage } from "@/features/marketing/SipPanelCalculatorPage";
import { InviteAcceptPage } from "@/features/company/InviteAcceptPage";
import { TeamPage } from "@/features/company/TeamPage";
import { WorkspaceProjectsPage } from "@/features/workspace/WorkspaceProjectsPage";
import { SeoRouteGuard } from "@/shared/seo/SeoRouteGuard";

import { EditorAppView } from "./EditorAppView";

export default function App() {
  return (
    <BrowserRouter>
      <SeoRouteGuard />
      <Routes>
        <Route path="/" element={<HouseKitLandingPage />} />
        <Route path="/sip-house-design-software" element={<SipHouseDesignSoftwarePage />} />
        <Route path="/sip-panel-calculator" element={<SipPanelCalculatorPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/app" element={<EditorAppView />} />
        <Route path="/app/projects" element={<WorkspaceProjectsPage />} />
        <Route path="/app/team" element={<TeamPage />} />
        <Route path="/invite/:inviteId" element={<InviteAcceptPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/demo" element={<Navigate to="/app?demo=true" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
