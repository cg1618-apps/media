// Frontend: what a request is about, as one table cell's contents.
//
// The server resolves the target (`{type, type_label, id, label, nav_path,
// missing}`): a link while there is a page to go to, plain text when there is
// none (a series has no nav path), and the stored name marked "(deleted)"
// once the target is gone. A request with no target shows its page address,
// if it has one, and otherwise a dash.
import { Link } from "react-router-dom";

export default function RequestTarget({ request }) {
  const { target, page_path: pagePath } = request;

  if (!target) {
    return pagePath ? (
      <span className="font-mono text-xs text-text-muted break-all">{pagePath}</span>
    ) : (
      <span className="text-text-faint">—</span>
    );
  }

  return (
    <span>
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {target.type_label}
      </span>
      {target.nav_path && !target.missing ? (
        <Link to={target.nav_path} className="text-text hover:text-brand transition">
          {target.label}
        </Link>
      ) : (
        <span className="text-text">{target.label}</span>
      )}
      {target.missing && <span className="ml-1 text-text-faint">(deleted)</span>}
    </span>
  );
}
