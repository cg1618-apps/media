// One category's option values, grouped by the media type each is scoped to
// (lib/optionScopeGroups.js). Shared by the admin Modify and Delete pages,
// which differ only in what a value's card does - so each passes its own
// renderOption.
//
// A category whose values all fall in one type's group renders without a
// heading: "Game" over every Game Genre value says nothing the category does
// not. The Shared group always keeps its headings, because its sub-group
// headings are the only place a value's types are shown.
import { mediaTypeLabel } from "../../config/mediaRegistry";
import {
  SHARED,
  UNSCOPED,
  groupOptionsByScope,
} from "../../lib/optionScopeGroups";

const GRID = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2";
const HEADING =
  "text-xs font-black text-text-faint uppercase tracking-widest mb-2";
const SUB_HEADING = "text-xs font-bold text-text-faint mb-2";

function groupTitle(scope) {
  if (scope === UNSCOPED) return "All types";
  if (scope === SHARED) return "Shared";
  return mediaTypeLabel(scope);
}

function Count({ n }) {
  return <span className="ml-1.5 font-mono">{n}</span>;
}

export default function OptionValueGroups({ options, renderOption }) {
  const groups = groupOptionsByScope(options);
  if (groups.length <= 1 && groups[0]?.scope !== SHARED) {
    return <div className={GRID}>{options.map(renderOption)}</div>;
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.scope ?? "unscoped"}>
          <h3 className={HEADING}>
            {groupTitle(group.scope)}
            <Count
              n={
                group.scope === SHARED
                  ? group.sets.reduce((sum, s) => sum + s.options.length, 0)
                  : group.options.length
              }
            />
          </h3>
          {group.scope === SHARED ? (
            <div className="space-y-3 pl-3 border-l-2 border-border">
              {group.sets.map(({ scopes, options: members }) => (
                <div key={scopes.join("|")}>
                  <h4 className={SUB_HEADING}>
                    {scopes.map(mediaTypeLabel).join(" · ")}
                    <Count n={members.length} />
                  </h4>
                  <div className={GRID}>{members.map(renderOption)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className={GRID}>{group.options.map(renderOption)}</div>
          )}
        </section>
      ))}
    </div>
  );
}
