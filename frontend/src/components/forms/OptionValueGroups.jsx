// One category's option values, grouped by the media type each is scoped to
// (lib/optionScopeGroups.js). Shared by the admin Modify and Delete pages,
// which differ only in what a value's card does - so each passes its own
// renderOption.
//
// A category whose values all fall in one group renders without a heading:
// "Game" over every Game Genre value says nothing the category does not.
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { UNSCOPED, groupOptionsByScope } from "../../lib/optionScopeGroups";

const GRID = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2";

export default function OptionValueGroups({ options, renderOption }) {
  const groups = groupOptionsByScope(options);
  if (groups.length <= 1) {
    return <div className={GRID}>{options.map(renderOption)}</div>;
  }
  return (
    <div className="space-y-5">
      {groups.map(({ scope, options: members }) => (
        <section key={scope ?? "unscoped"}>
          <h3 className="text-xs font-black text-text-faint uppercase tracking-widest mb-2">
            {scope === UNSCOPED ? "All types" : mediaTypeLabel(scope)}
            <span className="ml-1.5 font-mono">{members.length}</span>
          </h3>
          <div className={GRID}>{members.map(renderOption)}</div>
        </section>
      ))}
    </div>
  );
}
