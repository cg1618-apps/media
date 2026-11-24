// Frontend: page component file for OrderPage.
//
// The shareable, full-page view of one order. Same guide the Franchise /
// Collection tab renders, given more room: bigger posters, notes always shown,
// and links back to the owner and to the owner's other orders.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import FollowOrderButton from "../../components/tracker/FollowOrderButton";
import OrderGuide, {
  MediaTypeFilter,
} from "../../components/tracker/OrderGuide";
import { getDisplayName } from "../../utils/media";
import { Chip, Slip } from "../../components/ui/primitives";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";
import { ownerKeyOf, orderEditPath } from "../../lib/orderPaths";

export default function OrderPage() {
  const { publicId } = useParams();
  const { isAdmin } = useAuth();

  const [list, setList] = useState(null);
  const [owner, setOwner] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The media type the guide is narrowed to, or null for every step. Per page
  // view: it is not kept anywhere, and opening another order starts at All.
  const [typeFilter, setTypeFilter] = useState(null);

  useCanonicalPath("order", list);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTypeFilter(null);

    fetch(endpoints.order.list(publicId), { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              res.status === 404 ? "Order not found." : res.statusText
            )
      )
      .then(async (data) => {
        if (cancelled) return;
        setList(data);
        setError(null);

        // The owner's name and its other orders are two extra round trips, so
        // they load after the guide itself rather than blocking it.
        const ownerType = data.franchise_id ? "franchise" : "collection";
        const ownerId = data.franchise_id || data.collection_id;

        const [ownerRes, siblingRes] = await Promise.all([
          fetch(endpoints.resource(ownerType).detail(ownerId), {
            credentials: "include",
          }).then((r) => (r.ok ? r.json() : null)),
          fetch(
            buildUrl(endpoints.order.lists(), {
              franchise_id: data.franchise_id,
              collection_id: data.collection_id,
            }),
            { credentials: "include" }
          ).then((r) => (r.ok ? r.json() : [])),
        ]);

        if (cancelled) return;
        setOwner(ownerRes ? { type: ownerType, id: ownerId, data: ownerRes } : null);
        setSiblings(siblingRes.filter((l) => l.system_id !== data.system_id));
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // The heading's name, which the browser tab shows too.
  const listName = list ? list.list_name || "Untitled order" : null;
  usePageTitle(loading || error ? null : listName);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-faint">
        <i className="fas fa-circle-notch fa-spin text-2xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24">
        <section className="border border-dashed border-border-strong px-4 py-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
            Order
          </div>
          <p className="text-sm text-text-faint">{error}</p>
          <Link
            to="/"
            className="inline-block mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted hover:text-brand transition"
          >
            Back home
          </Link>
        </section>
      </div>
    );
  }

  const ownerName = owner ? getDisplayName(owner.data, owner.type) : null;
  const ownerLabel = owner?.type === "collection" ? "Collection" : "Franchise";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb: the owner, then this order */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3 flex-wrap"
        aria-label="Breadcrumb"
      >
        {owner && (
          <>
            <span>{ownerLabel}</span>
            <span aria-hidden="true">/</span>
            <Link
              to={`/${owner.type}/${owner.id}`}
              className="hover:text-brand transition normal-case tracking-normal truncate max-w-xs"
            >
              {ownerName}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span className="text-text-muted">Order</span>
      </nav>

      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Admin
          </div>
          <Link
            to={orderEditPath(ownerKeyOf(list), list.system_id)}
            className="border border-border-strong text-text bg-surface px-3 py-1.5 text-sm font-medium hover:border-text transition"
          >
            Edit this order
          </Link>
        </div>
      )}

      <header className="mb-8">
        {/*
          Scope leads: it sits on its own line above the title, so what kind of
          order this is registers before the name. The remaining marks drop
          below the title rather than competing with it. On a cross-type order
          the scope is also the type filter for the guide below.
        */}
        <MediaTypeFilter
          mediaTypes={list.media_types}
          value={typeFilter}
          onChange={setTypeFilter}
          className="mb-3"
        />

        <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-3">
          {listName}
        </h1>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          {list.list_type && <Chip>{list.list_type}</Chip>}
          {list.is_most_recommended && <Chip tone="brand">Most recommended</Chip>}
          {list.is_default && <Chip tone="muted">Default</Chip>}
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            {list.item_count} steps
          </span>
          <FollowOrderButton list={list} />
        </div>
      </header>

      <OrderGuide list={list} roomy colourCoded typeFilter={typeFilter} />

      {siblings.length > 0 && (
        <Slip
          title={`Other orders for ${ownerName || "this title"}`}
          padded={false}
          className="mt-10"
        >
          <ul className="divide-y divide-border">
            {siblings.map((s) => (
              <li key={s.system_id}>
                <Link
                  to={entityPath("order", s)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition"
                >
                  <span className="text-sm text-text">
                    {s.list_name || "Untitled order"}
                  </span>
                  <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                    {s.item_count} steps
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Slip>
      )}
    </div>
  );
}
