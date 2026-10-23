// Frontend: where this entry sits in the watch orders the viewer follows.
//
// Mounted once per entry detail page, directly under the header. It is drawn
// as a brand-ruled band rather than a Slip on purpose: Relations, in the left
// column, is a slip listing what the entry is related to; this says where the
// viewer is in an order they chose to follow, and the two must not read as
// the same thing. Renders nothing for a viewer who cannot follow, and nothing
// when no followed order contains the entry.
import { Link } from "react-router-dom";

import { useEntryFollows } from "../../api/mutations/useWatchOrderFollows";
import { useAuth } from "../../contexts/AuthContext";
import { entityPath } from "../../lib/entityPath";
import { Eyebrow } from "../ui/primitives";
import FollowedStep from "./FollowedStep";

/** "step 3 / 8", or "steps 1, 3 / 8" for a split run. */
export function stepPosition(occurrences, total) {
  const numbers = occurrences.map((o) => o.step.number);
  return `${numbers.length > 1 ? "steps" : "step"} ${numbers.join(", ")} / ${total}`;
}

function FollowedOrder({ context }) {
  const { list, owner, total, occurrences } = context;
  const orderPath = entityPath("watch-order", list);
  const ownerPath = entityPath(owner.tier, owner);
  const orderName = list.list_name || "Untitled order";
  return (
    <div className="bg-surface border border-border border-l-2 border-l-brand px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow className="text-brand">Following</Eyebrow>
        {orderPath ? (
          <Link
            to={orderPath}
            className="font-display text-base font-semibold text-text hover:text-brand transition"
          >
            {orderName}
          </Link>
        ) : (
          <span className="font-display text-base font-semibold text-text">
            {orderName}
          </span>
        )}
        {owner.display_name && (
          <span className="text-sm text-text-muted">
            (
            {ownerPath ? (
              <Link to={ownerPath} className="hover:text-brand transition">
                {owner.display_name}
              </Link>
            ) : (
              owner.display_name
            )}
            )
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint tabular-nums">
          {stepPosition(occurrences, total)}
        </span>
      </div>

      {/* One block per occurrence: a split run sits between different
          neighbours each time, so each half keeps its own prev and next. */}
      {occurrences.map((o) => (
        <div
          key={o.step.number}
          className="mt-2 pt-2 border-t border-dotted border-border-strong/60 space-y-1.5"
        >
          <FollowedStep step={o.previous} label="Prev" />
          <FollowedStep step={o.step} label="This" />
          <FollowedStep step={o.next} label="Next" />
        </div>
      ))}
    </div>
  );
}

export default function FollowedOrderPanel({ entryId }) {
  const { has } = useAuth();
  const { data } = useEntryFollows(entryId, has("self.list"));
  if (!data?.length) return null;
  return (
    <section aria-label="Followed watch orders" className="space-y-3">
      {data.map((context) => (
        <FollowedOrder key={context.list.system_id} context={context} />
      ))}
    </section>
  );
}
