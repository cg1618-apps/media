// Frontend: the dashboard's Coming Next block, under the weekly schedule.
import { useState } from "react";
import { Link } from "react-router-dom";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getDisplayName } from "../../lib/naming";
import { formatReleaseDate, primaryReleaseValue } from "../../lib/releaseDate";
import { formatSeason, selectComingNext } from "../../lib/comingNext";
import { Chip, Slip } from "../ui/primitives";

const SUBSECTIONS = [
  { key: "airs", title: "Watch when airs" },
  { key: "planned", title: "Planned to" },
];

function ComingEntry({ item, type }) {
  const name = getDisplayName(item, type);
  const date = formatReleaseDate(primaryReleaseValue(type, item));
  return (
    <li>
      <Link
        to={`${MEDIA_CONFIG[type].navPath}/${item.system_id}`}
        title={`${date} · ${name}`}
        className="block py-1.5 border-b border-border text-sm text-text leading-tight hover:text-brand transition-colors"
      >
        <span className="block font-mono text-[10px] tracking-[0.14em] text-text-faint tabular-nums">
          {date}
        </span>
        <span className="block">{name}</span>
      </Link>
    </li>
  );
}

function SubSection({ title, groups, season }) {
  const count = groups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between px-4 py-2 border-b border-border">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {title}
        </h4>
        <span className="font-mono text-[10px] text-text-faint">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-faint">
          Nothing for {formatSeason(season)}.
        </p>
      ) : (
        // One column per media type, scrolling horizontally like the day
        // columns of the weekly schedule.
        <div className="flex overflow-x-auto">
          {groups.map(({ type, label, items }) => (
            <div
              key={type}
              className="w-64 shrink-0 p-3 border-r border-border last:border-r-0"
            >
              <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-border">
                <h5 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {label}
                </h5>
                <span className="font-mono text-[10px] text-text-faint">
                  {items.length}
                </span>
              </div>
              <ul>
                {items.map((item) => (
                  <ComingEntry key={item.system_id} item={item} type={type} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What the viewer is waiting on (Watch When Airs / Play When Released) and has
 * planned (Plan to Watch / Plan to Play) for `season`, grouped by media type.
 * `lists` maps a media-type slug to its entries. Collapsed until opened.
 */
export default function ComingNext({ id, lists, season }) {
  const [collapsed, setCollapsed] = useState(true);
  const sections = selectComingNext(lists, season);
  const total = SUBSECTIONS.reduce(
    (sum, { key }) =>
      sum + sections[key].reduce((n, g) => n + g.items.length, 0),
    0,
  );

  const actions = (
    <>
      <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        Next season · {formatSeason(season)}
      </span>
      <Chip tone="ink">{total}</Chip>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed((v) => !v);
        }}
        className="text-text-faint hover:text-text text-sm px-1"
        aria-label={collapsed ? "Expand" : "Collapse"}
        aria-expanded={!collapsed}
      >
        <i className={`fas fa-chevron-${collapsed ? "down" : "up"}`}></i>
      </button>
    </>
  );

  return (
    <Slip
      id={id}
      title="Coming next"
      actions={actions}
      padded={false}
      className="select-none"
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? null : (
        <div
          className="divide-y divide-border"
          onClick={(e) => e.stopPropagation()}
        >
          {SUBSECTIONS.map(({ key, title }) => (
            <SubSection
              key={key}
              title={title}
              groups={sections[key]}
              season={season}
            />
          ))}
        </div>
      )}
    </Slip>
  );
}
