import { Link } from "react-router-dom";

import "./editorCloudAuthBanner.css";

export function EditorCloudAuthBanner() {
  return (
    <div className="editor-cloud-auth-banner" role="status">
      <span className="editor-cloud-auth-banner-text">
        Войдите, чтобы сохранять проекты в облаке.
      </span>
      <Link className="editor-cloud-auth-banner-link" to="/login?returnUrl=/app">
        Войти
      </Link>
    </div>
  );
}
