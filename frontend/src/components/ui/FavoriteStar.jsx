// Frontend: the star that makes a quote or a meme the viewer's own favourite.
//
// Favourites are a granted feature, so the star renders only for an account
// holding `favourites` (useAuth().hasFeature) - anyone else reads every row's
// `is_favorite` as false and has nothing to toggle. It writes through
// PUT /api/me/favorites/{kind}/{id} (useSetMyFavorite), never through the
// catalogue's PATCH.
import { useAuth } from "../../contexts/AuthContext";
import { useSetMyFavorite } from "../../api/mutations/useMyFavorite";
import { useToast } from "../../hooks/useToast";

export const FAVOURITES_FEATURE = "favourites";

export default function FavoriteStar({ kind, item, className = "" }) {
  const { hasFeature } = useAuth();
  const { mutateAsync, isPending } = useSetMyFavorite();
  const { showToast } = useToast();
  if (!hasFeature(FAVOURITES_FEATURE)) return null;

  const on = !!item.is_favorite;
  const toggle = async () => {
    try {
      await mutateAsync({ kind, id: item.system_id, isFavorite: !on });
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={on}
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      title={on ? "Remove from favourites" : "Add to favourites"}
      className={`${on ? "text-brand" : "text-text-faint hover:text-brand"} ${className}`}
    >
      <i className="fas fa-star text-xs" />
    </button>
  );
}
