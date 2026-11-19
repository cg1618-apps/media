// Frontend: the 待補充 Needs Work badge on an entry's or a group's page.
//
// One component for the fifteen owner pages - the twelve media types and the
// collection, franchise and series pages - beside "Report a problem" in the
// breadcrumb row. Drawn only for a viewer holding manage.requests (super and
// the admin), the key every /api/needs-work route asks, and only while the
// owner is marked. It links to the Needs Work page, where the mark is
// handled; the mark itself is set on the Modify page.
import { Link } from "react-router-dom";

import { useNeedsWorkMark } from "../../api/mutations/useNeedsWork";
import { useAuth } from "../../contexts/AuthContext";
import { Chip } from "../ui/primitives";

export default function NeedsWorkBadge({ ownerType, ownerId }) {
  const auth = useAuth();
  // Outside an AuthProvider nobody is known to hold anything.
  const canSee = Boolean(auth?.has?.("manage.requests"));
  const { data } = useNeedsWorkMark(ownerType, ownerId, { enabled: canSee });

  if (!canSee || data?.flagged !== true) return null;

  return (
    <Link
      to="/needs-work"
      title={data.note ? `待補充: ${data.note}` : "待補充 Needs Work"}
      className="shrink-0 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Chip tone="danger" className="max-w-[16rem]">
        <span>待補充</span>
        {data.note && (
          <span className="normal-case tracking-normal truncate">· {data.note}</span>
        )}
      </Chip>
    </Link>
  );
}
