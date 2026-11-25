// Frontend: what is next from this entry in the orders the viewer follows.
//
// Mounted once per entry detail page, directly under the header. It is drawn
// as a brand-ruled band rather than a Slip on purpose: Relations, in the left
// column, is a slip listing what the entry is related to; this says where the
// viewer is in an order they chose to follow, and the two must not read as
// the same thing. Renders nothing for a viewer who cannot follow, and nothing
// when no followed order contains the entry.
//
// Per occurrence of the entry it shows the direct next step - the first later
// step the follow's importance admits that is neither done, started nor
// skipped - and, under a "Coming up" rule, the lookahead the server sends
// with it: the next Recommended and/or Essential step. Which steps those are
// is decided once, by the backend (order_follow.next_steps); this only draws.
import { Link } from "react-router-dom";

import { useEntryFollows } from "../../api/mutations/useOrderFollows";
import { useAuth } from "../../contexts/AuthContext";
import { entityPath } from "../../lib/entityPath";
import { Eyebrow } from "../ui/primitives";
import { FOLLOW_IMPORTANCE_OPTIONS } from "./FollowOrderButton";
import FollowedStep from "./FollowedStep";

/** "step 3 / 8", or "steps 1, 3 / 8" for a split run. */
export function stepPosition(occurrences, total) {
  const numbers = occurrences.map((o) => o.step.number);
  return `${numbers.length > 1 ? "steps" : "step"} ${numbers.join(", ")} / ${total}`;
}

/** The follow's rung as the follow control words it ("Normal and up"). */
export function importanceLabel(importance) {
  return (
    FOLLOW_IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.label ||
    importance
  );
}

function NextFrom({ occurrence, listId }) {
  const { next, coming_up: comingUp = [] } = occurrence;
  if (!next) {
    return (
      <p className="text-xs text-text-faint">Nothing left after this step.</p>
    );
  }
  return (
    <>
      <FollowedStep step={next} label="Next" listId={listId} />
      {comingUp.length > 0 && (
        // The gap and the rule say these are not the next step: they are
        // shown because they rank higher than it.
        <div className="mt-2.5 pt-2 border-t border-dashed border-border space-y-1.5">
          <Eyebrow as="p" className="text-text-faint">
            Coming up
          </Eyebrow>
          {comingUp.map((step) => (
            <FollowedStep
              key={step.number}
              step={step}
              label=""
              listId={listId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FollowedOrder({ context }) {
  const { list, owner, total, occurrences, importance } = context;
  const orderPath = entityPath("order", list);
  const ownerPath = entityPath(owner.tier, owner);
  const orderName = list.list_name || "Untitled order";
  return (
    <div className="bg-surface border border-border border-l-2 border-l-brand px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow className="text-brand">Following order</Eyebrow>
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
        <span className="ml-auto font-mono text-[11px] text-text-faint tabular-nums">
          {stepPosition(occurrences, total)}
          {importance && ` · ${importanceLabel(importance)}`}
        </span>
      </div>

      {/* One block per occurrence: a split run sits at a different place
          each time, so each half has its own next. */}
      {occurrences.map((o) => (
        <div
          key={o.step.number}
          className="mt-2 pt-2 border-t border-dotted border-border-strong/60 space-y-1.5"
        >
          <NextFrom occurrence={o} listId={list.system_id} />
        </div>
      ))}
    </div>
  );
}

/**
 * One name on every type: an order may mix watching, reading and playing, so
 * it is an "order" whatever the page's own entry is.
 */
export default function FollowedOrderPanel({ entryId }) {
  const { has } = useAuth();
  const { data } = useEntryFollows(entryId, has("self.list"));
  if (!data?.length) return null;
  return (
    <section aria-label="Followed orders" className="space-y-3">
      {data.map((context) => (
        <FollowedOrder key={context.list.system_id} context={context} />
      ))}
    </section>
  );
}
