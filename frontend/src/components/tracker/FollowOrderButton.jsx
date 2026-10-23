// Frontend: the Follow / Following toggle for one watch order.
//
// Drawn on the order's own page and beside the order picked in a group page's
// watch-order section. A member follows at most one order per group, so
// following this one replaces whichever of its group's orders was followed -
// the server does the replacing, and the shared follows query refetches.
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  useToggleFollow,
  useWatchOrderFollows,
} from "../../api/mutations/useWatchOrderFollows";
import { Button } from "../ui/primitives";

/** True when `listId` is among the caller's follows. */
export function isFollowed(follows, listId) {
  return (follows || []).some((f) => f.list.system_id === listId);
}

export default function FollowOrderButton({ list }) {
  const { has } = useAuth();
  const canFollow = has("self.list");
  const { showToast } = useToast();
  const follows = useWatchOrderFollows(canFollow);
  const toggle = useToggleFollow();

  if (!canFollow || !list) return null;
  const following = isFollowed(follows.data, list.system_id);

  function onClick() {
    toggle.mutate(
      { listId: list.system_id, following },
      {
        onSuccess: () =>
          showToast("success", following ? "Unfollowed" : "Following"),
        onError: (e) => showToast("error", e.message),
      },
    );
  }

  return (
    <Button
      kind={following ? "outline" : "primary"}
      size="sm"
      onClick={onClick}
      disabled={toggle.isPending || follows.isLoading}
      aria-pressed={following}
      title={
        following
          ? "Stop following this order"
          : "Follow this order - replaces any other order you follow for this group"
      }
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
