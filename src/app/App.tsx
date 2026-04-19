import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";

import { HouseKitLandingPage } from "@/features/marketing/HouseKitLandingPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterCompanyPage } from "@/features/auth/RegisterCompanyPage";

import { EditorAppView } from "./EditorAppView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HouseKitLandingPage />} />
        <Route path="/app" element={<EditorAppView />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterCompanyPage />} />
        <Route path="/demo" element={<Navigate to="/app?demo=true" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
