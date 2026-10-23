// Frontend: the dashboard's Followed watch orders block, under Coming Next.
//
// One row per followed order: its group and name, done / total, every step in
// progress ("Now") and the earliest step not yet started ("Up next"). Never
// the full step list - that is the order's own page. Collapsed until opened,
// like Coming Next, and drawn only for a viewer who can follow.
import { useState } from "react";
import { Link } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";
import { Chip, ProgressRule, Slip } from "../ui/primitives";
import FollowedStep from "./FollowedStep";

function FollowedRow({ follow }) {
  const { list, owner, done, total, now, up_next: upNext } = follow;
  const orderPath = entityPath("watch-order", list);
  const orderName = list.list_name || "Untitled order";
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {owner.display_name && (
          <span className="text-sm text-text-muted">{owner.display_name} ·</span>
        )}
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
        <span className="ml-auto font-mono text-[11px] text-text-muted tabular-nums">
          {done} / {total}
        </span>
      </div>
      <ProgressRule value={total ? done / total : 0} className="mt-1.5 mb-2" />
      <div className="space-y-1">
        {now.map((step) => (
          <FollowedStep key={`now-${step.number}`} step={step} label="Now" showNote={false} />
        ))}
        {upNext ? (
          <FollowedStep step={upNext} label="Next" showNote={false} />
        ) : (
          <p className="text-xs text-text-faint">Every step is done.</p>
        )}
      </div>
    </li>
  );
}

/** `follows` is the array GET /api/watch-order/follows answers. */
export default function FollowedOrders({ id, follows }) {
  const [collapsed, setCollapsed] = useState(true);
  const rows = follows || [];

  const actions = (
    <>
      <Chip tone="ink">{rows.length}</Chip>
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
      title={`Followed watch orders (${rows.length})`}
      actions={actions}
      padded={false}
      className="select-none"
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? null : rows.length === 0 ? (
        <p
          className="px-4 py-6 text-center text-sm text-text-faint"
          onClick={(e) => e.stopPropagation()}
        >
          You follow no watch order. Follow one from its page or from a
          franchise, series or collection.
        </p>
      ) : (
        <ul
          className="divide-y divide-border select-text"
          onClick={(e) => e.stopPropagation()}
        >
          {rows.map((follow) => (
            <FollowedRow key={follow.list.system_id} follow={follow} />
          ))}
        </ul>
      )}
    </Slip>
  );
}
