// Frontend: the optional Group of a section flagged `kind_is_group` - Resources
// and 彩蛋 Easter Eggs - stored in the row's `kind`.
//
// Once any row has a group, the card draws one heading per group, in the
// order each group first appears among the rows, and the ungrouped rows last
// under "Other" (groupedRows.js). The rows are drawn - and folded, and
// reordered - in that grouped order, so dragging a row above another group's
// first row moves its whole group up. With no row grouped the list is the
// plain one. A named group's heading carries a rename control (GroupName) for
// a viewer with a row of that group to edit; "Other" is no stored name and has
// none.
//
// The Group field suggests the owner's own groups and, where the section
// names a `kind_category`, that common option's values (彩蛋's "Easter Egg
// Group"). Suggestions only: the group is stored as typed.
import { useId } from "react";

import { GroupName, inputCls } from "./ui";
import { groupNotes } from "./groupedRows";

const OTHER = "Other";

// Shared with TextLinksSection's Public and Personal headings, which are
// in-card group headings too.
export const groupHeadingCls =
  "font-mono text-[10px] text-text-faint";

/**
 * The grouped reading of `notes`. `rows` is every row in drawing order;
 * `opensGroup(row, previous)` says whether a heading goes above `row`.
 * `groupOptions` is null for a section with no group.
 */
export function useKindGroups({
  section,
  notes,
  canEditRow,
  onRenameGroup,
  optionValues,
}) {
  const groups = section.kind_is_group
    ? groupNotes(notes, null, [], "kind")
    : [{ name: null, notes }];
  const grouped = groups.some((g) => g.name !== null);
  // Each row's group name, null for the ungrouped rows under "Other".
  const groupOf = new Map(
    groups.flatMap((g) => g.notes.map((n) => [n.system_id, g.name])),
  );
  const renamable = new Set(
    onRenameGroup
      ? groups
          .filter((g) => g.name !== null && g.notes.some(canEditRow))
          .map((g) => g.name)
      : [],
  );
  const own = groups.map((g) => g.name).filter((name) => name !== null);
  const common =
    (section.kind_category && optionValues?.[section.kind_category]) || [];
  const groupOptions = section.kind_is_group
    ? [...new Set([...own, ...common])]
    : null;
  return {
    rows: groups.flatMap((g) => g.notes),
    groupOf,
    groupOptions,
    opensGroup: (row, previous) =>
      grouped &&
      groupOf.get(row.system_id) !== groupOf.get(previous?.system_id),
    heading: (row) => {
      const name = groupOf.get(row.system_id);
      return (
        <KindGroupHeading
          name={name}
          onRename={
            renamable.has(name)
              ? (to) => onRenameGroup(section.key, name, to)
              : undefined
          }
        />
      );
    },
  };
}

/** The heading above one group's run of rows; `name` null is "Other". */
function KindGroupHeading({ name, onRename }) {
  return (
    <div className="flex items-center gap-1 pt-1 first:pt-0">
      {name === null ? (
        <p data-testid="group-heading" className={groupHeadingCls}>
          {OTHER}
        </p>
      ) : (
        <GroupName
          name={name}
          onRename={onRename}
          inputClassName="max-w-xs py-0.5"
        >
          <p data-testid="group-heading" className={groupHeadingCls}>
            {name}
          </p>
        </GroupName>
      )}
    </div>
  );
}

/** The optional Group field, with its suggestions; nothing when `options` is null. */
export function GroupInput({ value, onChange, options }) {
  const listId = useId();
  if (!options) return null;
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Group (optional)"
        list={listId}
        className={inputCls}
      />
      <datalist id={listId}>
        {options.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </>
  );
}
