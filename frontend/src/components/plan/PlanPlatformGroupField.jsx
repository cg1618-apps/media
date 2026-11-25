// Frontend: a game's platform group, on its detail page.
//
// While the viewer has the game queued to play next, the tracker card offers
// the same picker the Plan page's card carries (PlatformGroupSelect), so the
// group can be set where the game is queued instead of only on the Plan
// page. It reads the viewer's own plan row from ["plan-next"]
// (usePlanNextRows): queuing or unqueuing the game invalidates that key, so
// the picker appears and disappears with the Play next toggle. Not queued, or
// the row not loaded yet, draws nothing.
import { useId } from "react";

import PlatformGroupSelect from "./PlatformGroupSelect";
import { SELECT_CLS } from "../tracker/MyTrackerCard";
import { Eyebrow } from "../ui/primitives";
import { usePlanNextRows } from "../../hooks/usePlanNextRows";

export default function PlanPlatformGroupField({ mediaType, entryId, queued }) {
  const id = useId();
  const { data } = usePlanNextRows({ enabled: Boolean(queued) });
  if (!queued) return null;
  const row = (data || []).find(
    (r) =>
      r.kind === "next" &&
      r.scope === "entry" &&
      r.media_type === mediaType &&
      String(r.target_id) === String(entryId),
  );
  if (!row) return null;
  return (
    <div className="space-y-1.5">
      <Eyebrow as="label" htmlFor={id} className="block">
        Platform group
      </Eyebrow>
      <PlatformGroupSelect row={row} id={id} className={SELECT_CLS} />
    </div>
  );
}
