import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";

import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HouseKitLandingPage } from "@/features/marketing/HouseKitLandingPage";
import { WorkspaceProjectsPage } from "@/features/workspace/WorkspaceProjectsPage";

import { EditorAppView } from "./EditorAppView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HouseKitLandingPage />} />
        <Route path="/app" element={<EditorAppView />} />
        <Route path="/app/projects" element={<WorkspaceProjectsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/demo" element={<Navigate to="/app?demo=true" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
