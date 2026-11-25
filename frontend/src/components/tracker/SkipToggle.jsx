// Frontend: the follower's skip toggle for one step of an order they follow.
//
// Drawn beside each step of the entry page's FollowedOrderPanel and of the
// order's own guide, for a viewer who follows that order. The mark is the
// viewer's own (PUT / DELETE /api/order/lists/{id}/follow/skips/{step_id}).
import { useToggleSkip } from "../../api/mutations/useOrderFollows";
import { useToast } from "../../hooks/useToast";

/**
 * The follower's own skip mark on one step of an order they follow. A skipped
 * step is never shown as next; the mark is cleared from the same toggle, here
 * or on the order's page.
 */
export default function SkipToggle({ listId, step, className = "" }) {
  const toggle = useToggleSkip();
  const { showToast } = useToast();
  if (!listId || !step?.step_id) return null;
  const skipped = Boolean(step.skipped);
  return (
    <button
      type="button"
      aria-pressed={skipped}
      disabled={toggle.isPending}
      title={
        skipped
          ? "Stop skipping this step"
          : "Skip this step - it will not be shown as next"
      }
      onClick={(e) => {
        // The toggle may sit inside a clickable row; it acts on its own.
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(
          { listId, stepId: step.step_id, skipped },
          {
            onSuccess: () =>
              showToast("success", skipped ? "Step restored" : "Step skipped"),
            onError: (err) => showToast("error", err.message),
          },
        );
      }}
      className={`font-mono text-[10px] px-1.5 py-0.5 border transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        skipped
          ? "border-border-strong bg-surface-2 text-text"
          : "border-border text-text-faint hover:text-text hover:border-border-strong"
      } ${className}`}
    >
      {skipped ? "Skipped" : "Skip"}
    </button>
  );
}
