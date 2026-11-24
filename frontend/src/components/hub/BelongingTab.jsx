// One media tab of the franchise or series hub: the strip of sort, filters
// and (on the franchise hub) grouping, then the entries as hub cards. What
// each type sorts and filters by is lib/hubTabs.js; the view itself is held
// by the page (hooks/useHubTabViews.js), so it survives a tab switch.
import { Fragment, useMemo } from "react";
import { getDisplayName } from "../../utils/media";
import { useViewScope } from "../../hooks/useViewScope";
import {
  HUB_SORTS,
  applyView,
  chipOptions,
  defaultFilters,
  hubTabConfig,
  isFiltered,
} from "../../lib/hubTabs";
import { ClearAllButton, Eyebrow } from "../ui/primitives";
import MediaCard from "../cards/MediaCard";
import { FilterEmpty } from "./HubStates";
import { GRID_CLS, SELECT_CLS, Section, pillCls } from "./HubChrome";
import TriStateFilter from "./TriStateFilter";

function Divider() {
  return <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>;
}

function GroupRail({ label, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <Eyebrow as="h3" className="shrink-0">
        {label}
      </Eyebrow>
      <span className="font-mono text-[10px] text-text-faint">{count}</span>
      <span className="flex-1 border-t border-dotted border-border-strong/60" />
    </div>
  );
}

// The entries split by the series they sit in, in the series list's order,
// with the ones outside every series last.
function groupBySeries(entries, seriesList) {
  const known = new Set(seriesList.map((s) => s.system_id));
  const grouped = {};
  const standalone = [];
  for (const e of entries) {
    if (e.series_id && known.has(e.series_id)) {
      (grouped[e.series_id] ||= []).push(e);
    } else standalone.push(e);
  }
  const groups = seriesList
    .filter((s) => grouped[s.system_id]?.length > 0)
    .map((s) => ({
      key: s.system_id,
      label: getDisplayName(s, "series") || "Unknown Series",
      entries: grouped[s.system_id],
    }));
  if (standalone.length > 0)
    groups.push({ key: "standalone", label: "Standalone", entries: standalone });
  return groups;
}

export default function BelongingTab({
  title,
  type,
  scope,
  entries,
  seriesList = [],
  view,
  onViewChange,
  onUpdated,
}) {
  const { ownData } = useViewScope();
  const config = hubTabConfig(type, scope);
  const groupable = config.groupBySeries !== undefined;

  const shown = useMemo(
    () => applyView(type, scope, entries, view),
    [type, scope, entries, view],
  );

  const setFilter = (key, value) =>
    onViewChange((v) => ({ ...v, filters: { ...v.filters, [key]: value } }));

  const toggleChip = (key, value) =>
    onViewChange((v) => {
      const next = new Set(v.filters[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...v, filters: { ...v.filters, [key]: next } };
    });

  const card = (e) => (
    <MediaCard
      key={e.system_id}
      type={type}
      data={e}
      onUpdated={onUpdated}
    />
  );

  let body;
  if (shown.length === 0) body = <FilterEmpty />;
  else if (groupable && view.groupBySeries) {
    const groups = groupBySeries(shown, seriesList);
    const rails = config.railForSingleGroup !== false || groups.length > 1;
    body = (
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.key}>
            {rails && <GroupRail label={g.label} count={g.entries.length} />}
            <div className={GRID_CLS}>{g.entries.map(card)}</div>
          </section>
        ))}
      </div>
    );
  } else body = <div className={GRID_CLS}>{shown.map(card)}</div>;

  return (
    <Section title={title} count={shown.length}>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          aria-label="Sort"
          value={view.sort}
          onChange={(e) => onViewChange((v) => ({ ...v, sort: e.target.value }))}
          className={SELECT_CLS}
        >
          {config.sorts
            .filter((key) => ownData || !HUB_SORTS[key].own)
            .map((key) => (
              <option key={key} value={key}>
                Sort: {HUB_SORTS[key].label}
              </option>
            ))}
        </select>

        {config.filters.map((f) => {
          if (f.kind === "tri") {
            return (
              <Fragment key={f.key}>
                <Divider />
                <TriStateFilter
                  label={f.label}
                  value={view.filters[f.key]}
                  onChange={(value) => setFilter(f.key, value)}
                />
              </Fragment>
            );
          }
          const options = chipOptions(f, entries);
          if (options.length === 0) return null;
          return (
            <Fragment key={f.key}>
              <Divider />
              {options.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view.filters[f.key].has(v)}
                  onClick={() => toggleChip(f.key, v)}
                  className={pillCls(view.filters[f.key].has(v))}
                >
                  {f.optionLabel ? f.optionLabel(v) : v}
                </button>
              ))}
            </Fragment>
          );
        })}

        {groupable && (
          <>
            <Divider />
            <button
              type="button"
              aria-pressed={view.groupBySeries}
              onClick={() =>
                onViewChange((v) => ({ ...v, groupBySeries: !v.groupBySeries }))
              }
              className={pillCls(view.groupBySeries)}
            >
              Group by series
            </button>
          </>
        )}

        <ClearAllButton
          active={isFiltered(view.filters)}
          onClick={() =>
            onViewChange((v) => ({ ...v, filters: defaultFilters(config) }))
          }
          className="ml-auto"
        />
      </div>

      {body}
    </Section>
  );
}
