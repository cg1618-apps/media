// Frontend: the Follow / Following toggle for one order, with its importance.
//
// Drawn on the order's own page and beside the order picked in a group page's
// order section. A member follows at most one order per group, so
// following this one replaces whichever of its group's orders was followed -
// the server does the replacing, and the shared follows query refetches.
//
// The importance picker beside the button is the lowest rung the follower
// wants shown as next. Before following it chooses the rung the follow starts
// at; once following, changing it changes the follow's rung straight away.
import { useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  useOrderFollows,
  useSetFollowImportance,
  useToggleFollow,
} from "../../api/mutations/useOrderFollows";
import { Button } from "../ui/primitives";

/** True when `listId` is among the caller's follows. */
export function isFollowed(follows, listId) {
  return Boolean(followOf(follows, listId));
}

/** The caller's follow of `listId`, or undefined. */
export function followOf(follows, listId) {
  return (follows || []).find((f) => f.list.system_id === listId);
}

// Each rung as the picker words it: what a follow at that rung is shown.
// The rungs are ITEM_IMPORTANCE's (OrderEditor.jsx), lowest first.
export const FOLLOW_IMPORTANCE_OPTIONS = [
  { value: "Optional", label: "Every step" },
  { value: "Normal", label: "Normal and up" },
  { value: "Recommended", label: "Recommended and up" },
  { value: "Essential", label: "Essential only" },
];

export const DEFAULT_FOLLOW_IMPORTANCE = "Normal";

export default function FollowOrderButton({ list }) {
  const { has } = useAuth();
  const canFollow = has("self.list");
  const { showToast } = useToast();
  const follows = useOrderFollows(canFollow);
  const toggle = useToggleFollow();
  const setImportance = useSetFollowImportance();
  // The rung a follow made from here starts at.
  const [draft, setDraft] = useState(DEFAULT_FOLLOW_IMPORTANCE);

  if (!canFollow || !list) return null;
  const follow = followOf(follows.data, list.system_id);
  const following = Boolean(follow);
  const importance = following
    ? follow.importance || DEFAULT_FOLLOW_IMPORTANCE
    : draft;
  const busy = toggle.isPending || setImportance.isPending || follows.isLoading;

  function onClick() {
    toggle.mutate(
      { listId: list.system_id, following, importance },
      {
        onSuccess: () =>
          showToast("success", following ? "Unfollowed" : "Following"),
        onError: (e) => showToast("error", e.message),
      },
    );
  }

  function onPick(value) {
    if (!following) {
      setDraft(value);
      return;
    }
    setImportance.mutate(
      { listId: list.system_id, importance: value },
      {
        onSuccess: () => showToast("success", "Follow importance changed"),
        onError: (e) => showToast("error", e.message),
      },
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        aria-label="Follow importance"
        title="The least important step shown as next"
        value={importance}
        disabled={busy}
        onChange={(e) => onPick(e.target.value)}
        className="border border-border-strong bg-surface text-text font-mono text-[11px] px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
      >
        {FOLLOW_IMPORTANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        kind={following ? "outline" : "primary"}
        size="sm"
        onClick={onClick}
        disabled={busy}
        aria-pressed={following}
        title={
          following
            ? "Stop following this order"
            : "Follow this order - replaces any other order you follow for this group"
        }
      >
        {following ? "Following" : "Follow"}
      </Button>
    </span>
  );
}
