// Frontend: card component file for PlatformIcons.
//
// The entry's main access platforms drawn as their own icons - 動畫瘋,
// Netflix, Disney+ and the rest - on the entry cards (MediaCard,
// DashboardCard). Only rows marked `available` are drawn, and only those with
// an icon in lib/sourceIcons.js: an icon-less vocabulary value (Cinema,
// Official site) has nothing to show at this size. A row with a url links to
// it; one without is drawn faded, known available with nowhere to go yet.
//
// `main` rows only, because their names come from the Platform vocabulary; a
// free-form Restricted row that merely resembles a platform name is someone's
// note, not the platform.
import { sourceIconUrl } from "../../lib/sourceIcons";

export function availablePlatforms(sources = []) {
  return sources
    .filter(
      (s) => s.kind === "access" && s.bucket === "main" && s.available === true,
    )
    .map((row) => ({ row, icon: sourceIconUrl(row.name) }))
    .filter(({ icon }) => icon);
}

const ICON_CLS = "w-4 h-4 rounded-sm bg-white object-contain";

// `linked` is false where the icon sits inside an area whose click already
// means something else (the library card's poster).
export default function PlatformIcons({ sources, linked = true, className = "" }) {
  const platforms = availablePlatforms(sources);
  if (platforms.length === 0) return null;

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {platforms.map(({ row, icon }) => {
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
            title={row.name}
          >
            {img}
          </a>
        ) : (
          <span
            key={row.system_id || row.name}
            className="inline-flex"
            title={row.url ? row.name : `${row.name} (no link)`}
          >
            {img}
          </span>
        );
      })}
    </span>
  );
}
