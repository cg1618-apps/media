// Frontend: the newest entries across every media type the viewer may see,
// from `GET /api/dashboard/recent`. The server narrows the list to the
// viewer's types and mode, as on every catalogue read, so nothing here
// filters.
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { useApiQuery } from "../../hooks/useApiQuery";
import { entityPath } from "../../lib/entityPath";
import { focusStyle, getCoverUrl, thumbUrl } from "../../lib/covers";
import LazyImage from "../ui/LazyImage";
import { Chip } from "../ui/primitives";

export const RECENTLY_ADDED_LIMIT = 12;

export default function RecentlyAdded({ limit = RECENTLY_ADDED_LIMIT }) {
  const query = useApiQuery(["dashboard", "recent"], endpoints.dashboard.recent(), {
    params: { limit },
  });

  if (query.isLoading) {
    return <p className="pt-6 text-sm text-text-faint">Loading…</p>;
  }
  if (query.isError) {
    return <p className="pt-6 text-sm text-danger">{query.error.message}</p>;
  }
  const entries = query.data ?? [];
  if (entries.length === 0) {
    return (
      <div className="mt-6 py-8 px-4 border border-dashed border-border-strong text-center">
        <p className="text-sm text-text-faint">Nothing has been added yet.</p>
      </div>
    );
  }

  return (
    <ul
      data-testid="recently-added"
      className="pt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
    >
      {entries.map((entry) => (
        <li key={entry.system_id}>
          <Link
            to={entityPath(entry.media_type, entry)}
            className="block bg-surface border border-border hover:border-border-strong transition-colors"
          >
            <LazyImage
              src={thumbUrl(getCoverUrl(entry.cover_image_file))}
              alt=""
              className="w-full aspect-[2/3] object-cover"
              style={focusStyle(entry.cover_image_focus)}
            />
            <div className="p-2 space-y-1">
              <Chip>{mediaTypeLabel(entry.media_type)}</Chip>
              <p className="font-display text-sm text-text leading-tight line-clamp-2">
                {entry.display_name}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
