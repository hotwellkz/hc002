import { Link, useNavigate } from "react-router-dom";

import { signOutEverywhere } from "@/features/auth/authActions";
import { useAuth } from "@/features/auth/AuthProvider";

import "./appWorkspaceNav.css";

export function AppWorkspaceNav() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const onLogout = async () => {
    await signOutEverywhere();
    navigate("/");
  };

  return (
    <nav className="app-ws-nav" aria-label="Рабочее пространство">
      <Link className="app-ws-nav-link" to="/app/projects">
        Проекты
      </Link>
      <Link className="app-ws-nav-link" to="/app/team">
        Команда
      </Link>
      <button type="button" className="app-ws-nav-logout" onClick={() => void onLogout()}>
        Выйти
      </button>
    </nav>
  );
}
