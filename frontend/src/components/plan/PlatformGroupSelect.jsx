// Frontend: the picker that files a queued game under a platform group.
//
// `row` is one of the caller's own plan_next rows, kind "next", on a type in
// PLATFORM_GROUP_TYPES (game, h-game). Picking PATCHes the row
// (usePlanPlatformGroup); "Ungrouped" clears it. The Plan page's card and the
// game's detail page both draw this one control, so the two cannot offer
// different groups.
import { PLATFORM_GROUPS } from "../../config/planNextGroups";
import { usePlanPlatformGroup } from "../../api/mutations/usePlanPlatformGroup";

export default function PlatformGroupSelect({ row, id, className = "" }) {
  const { mutate, isPending } = usePlanPlatformGroup();
  return (
    <select
      id={id}
      value={row.platform_group || ""}
      disabled={isPending}
      onChange={(e) =>
        mutate({ systemId: row.system_id, platformGroup: e.target.value || null })
      }
      aria-label={`Platform group for ${row.display_name || "this game"}`}
      className={className}
    >
      <option value="">Ungrouped</option>
      {PLATFORM_GROUPS.map((group) => (
        <option key={group} value={group}>
          {group}
        </option>
      ))}
    </select>
  );
}
