// Frontend: card component file for PlatformIcons.
//
// The entry's main access platforms drawn as their own icons - 動畫瘋,
// Netflix, Disney+ and the rest - on the entry cards (MediaCard,
// DashboardCard). Only rows marked `available` are drawn, and only those with
// an icon in lib/sourceIcons.js: an icon-less vocabulary value (Cinema,
// Official site) has nothing to show at this size. A row with a url links to
// it; one without is drawn faded, known available with nowhere to go yet.
//
// Regional variants share their site's icon (`Toptoon TW` and `Toptoon KR` are
// both Toptoon), so rows are grouped by icon and each icon is drawn once, at
// its first row's position. The drawn row is the first one carrying a url, so
// the icon still links whenever any variant does; the tooltip names them all.
//
// `main` rows only, because their names come from the Platform vocabulary; a
// free-form Restricted row that merely resembles a platform name is someone's
// note, not the platform.
import { sourceIconUrl } from "../../lib/sourceIcons";

export function availablePlatforms(sources = []) {
  const byIcon = new Map();
  for (const row of sources) {
    if (row.kind !== "access" || row.bucket !== "main" || row.available !== true) {
      continue;
    }
    const icon = sourceIconUrl(row.name);
    if (!icon) continue;
    const seen = byIcon.get(icon);
    if (!seen) {
      byIcon.set(icon, { row, icon, names: [row.name] });
      continue;
    }
    seen.names.push(row.name);
    if (!seen.row.url && row.url) seen.row = row;
  }
  return [...byIcon.values()];
}

const ICON_CLS = "w-4 h-4 rounded-sm bg-white object-contain";

// `linked` is false where the icon sits inside an area whose click already
// means something else (the library card's poster).
export default function PlatformIcons({ sources, linked = true, className = "" }) {
  const platforms = availablePlatforms(sources);
  if (platforms.length === 0) return null;

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {platforms.map(({ row, icon, names }) => {
        const label = names.join(" / ");
        const img = (
          <img
            loading="lazy"
            src={icon}
            alt={row.name}
            className={`${ICON_CLS} ${row.url ? "" : "opacity-50 grayscale"}`}
          />
        );
        return linked && row.url ? (
          <a
            key={row.system_id || row.name}
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex hover:scale-110 transition-transform"
            title={label}
          >
            {img}
          </a>
        ) : (
          <span
            key={row.system_id || row.name}
            className="inline-flex"
            title={row.url ? label : `${label} (no link)`}
          >
            {img}
          </span>
        );
      })}
    </span>
  );
}
