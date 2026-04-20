import { Link } from "react-router-dom";

import "./editorReadOnlyBanner.css";

/**
 * Баннер в редакторе для роли viewer над облачным проектом.
 * Сообщает, что изменения не будут сохранены.
 */
export function EditorReadOnlyBanner() {
  return (
    <div className="editor-readonly-banner" role="status">
      <span className="editor-readonly-banner-badge">Только просмотр</span>
      <span className="editor-readonly-banner-text">
        У вас режим только просмотра. Изменения не будут сохранены в облако.
      </span>
      <Link className="editor-readonly-banner-link" to="/app/projects">
        К проектам
      </Link>
    </div>
  );
}
