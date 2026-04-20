import { NavLink, useNavigate } from "react-router-dom";

import { signOutEverywhere } from "@/features/auth/authActions";
import { useAuth } from "@/features/auth/AuthProvider";

import "./appWorkspaceNav.css";

/**
 * Вкладки рабочего пространства компании: Проекты / Команда.
 * Активная вкладка определяется по текущему URL.
 */
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
      <div className="app-ws-tabs" role="tablist">
        <NavLink
          to="/app/projects"
          className={({ isActive }) =>
            isActive ? "app-ws-tab app-ws-tab--active" : "app-ws-tab"
          }
          role="tab"
          end
        >
          Проекты
        </NavLink>
        <NavLink
          to="/app/team"
          className={({ isActive }) =>
            isActive ? "app-ws-tab app-ws-tab--active" : "app-ws-tab"
          }
          role="tab"
          end
        >
          Команда
        </NavLink>
      </div>
      <button type="button" className="app-ws-nav-logout" onClick={() => void onLogout()}>
        Выйти
      </button>
    </nav>
  );
}
