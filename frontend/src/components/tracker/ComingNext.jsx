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

const countOf = (groups) => groups.reduce((sum, g) => sum + g.items.length, 0);

function SubSection({ title, groups, empty }) {
  const count = countOf(groups);
  return (
    <div>
      <div className="flex items-baseline justify-between px-4 py-2 border-b border-border">
        <h5 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {title}
        </h5>
        <span className="font-mono text-[10px] text-text-faint">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-faint">{empty}</p>
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
                <h6 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {label}
                </h6>
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

/** One season's block: its heading, then the two sub-sections. */
function SeasonPart({ title, sections, empty }) {
  const count = SUBSECTIONS.reduce((n, { key }) => n + countOf(sections[key]), 0);
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between px-4 py-2 border-b border-border bg-surface-2">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text">
          {title}
        </h4>
        <span className="font-mono text-[10px] text-text-faint">{count}</span>
      </div>
      <div className="divide-y divide-border">
        {SUBSECTIONS.map(({ key, title: subTitle }) => (
          <SubSection
            key={key}
            title={subTitle}
            groups={sections[key]}
            empty={empty}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * What the viewer is waiting on (Watch When Airs / Play When Released) and has
 * planned (Plan to Watch / Plan to Play), grouped by media type, in two
 * separate blocks: `currentSeason`'s entries that have not aired or released
 * by `today`, then `season`'s (next season's) entries. `lists` maps a
 * media-type slug to its entries. Collapsed until opened.
 */
export default function ComingNext({ id, lists, currentSeason, season, today }) {
  const [collapsed, setCollapsed] = useState(true);
  const parts = [
    {
      key: "this",
      title: `This season · ${formatSeason(currentSeason)} · not yet out`,
      sections: selectComingNext(lists, currentSeason, today),
      empty: `Nothing still to come in ${formatSeason(currentSeason)}.`,
    },
    {
      key: "next",
      title: `Next season · ${formatSeason(season)}`,
      sections: selectComingNext(lists, season),
      empty: `Nothing for ${formatSeason(season)}.`,
    },
  ];
  const total = parts.reduce(
    (sum, { sections }) =>
      sum + SUBSECTIONS.reduce((n, { key }) => n + countOf(sections[key]), 0),
    0,
  );

  const actions = (
    <>
      <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        {formatSeason(currentSeason)} · {formatSeason(season)}
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
          {parts.map(({ key, ...part }) => (
            <SeasonPart key={key} {...part} />
          ))}
        </div>
      )}
    </Slip>
  );
}
