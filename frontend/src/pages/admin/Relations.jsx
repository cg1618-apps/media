// Frontend: admin page for curating media relations.
//
// Left: pick a franchise, series or collection, then one of its entries.
// Right: the scope's relations as a canvas - where connecting, inspecting and deleting
// are done by hand - and under it the same three writes as a form, for the
// selected entry. The page holds one selection, which the left list and a
// click on the canvas both set, and both the canvas and the form read.
//
// The tier picker is a browsing lens, not ownership: unlike an order, a
// relation belongs to no tier - it links two entries, so the same relation
// shows at every tier holding either end. Collection works as the wider lens
// because it sits strictly above Franchise, which is also where most
// cross-franchise relations live; Series is the narrowest, and resolves
// against the entry's own series_id rather than widening to its franchise -
// so an anime movie, which carries no series, only ever appears there as a
// ghost.
//
// The picked scope lives in the URL as ?owner=<tier>:<system_id>, the key
// /orders uses, so a reload, a shared link or a hub's "Edit relations"
// lands on that franchise, series or collection rather than at square one.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";
import FittedName from "../../components/layout/FittedName";
import RelationGraph from "../../components/relations/RelationGraph";
import RelationForm from "../../components/relations/RelationForm";

// tier -> its toggle label, and the plural that keys its list in `owners`
// and names it in the picker's placeholder.
const SCOPE_TIERS = {
  franchise: { label: "Franchise", plural: "franchises" },
  series: { label: "Series", plural: "series" },
  collection: { label: "Collection", plural: "collections" },
};
const SCOPE_TYPES = Object.keys(SCOPE_TIERS);

// The query parameter each tier's scoped reads take; the server refuses more
// than one, so exactly one key is ever sent.
function scopeParams(scopeType, scopeId) {
  return { [`${scopeType}_id`]: scopeId };
}

// "franchise:FR001" -> { type, id }; anything else -> null, so a hand-edited
// or stale link opens the page empty instead of on a tier it cannot show.
function parseOwner(value) {
  const [type, id] = (value || "").split(":");
  return SCOPE_TYPES.includes(type) && id ? { type, id } : null;
}

export default function Relations() {
  const { showToast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const owner = parseOwner(searchParams.get("owner"));
  // The tier toggle with nothing picked yet: the URL names an owner, not a
  // bare tier, so this is the only part of the scope that is not in it.
  const [pickedType, setPickedType] = useState("franchise");
  const scopeType = owner?.type ?? pickedType;
  const scopeId = owner?.id ?? null;
  const [owners, setOwners] = useState({
    franchises: [],
    series: [],
    collections: [],
  });

  const [kinds, setKinds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  // The left pane's highlight, and the canvas's focus target.
  const [selected, setSelected] = useState(null); // {media_type, entry_id}
  const [query, setQuery] = useState("");
  // Bumped when the form writes, which is the canvas's cue to re-read. The
  // canvas refetches itself after its own writes; it cannot see the form's.
  const [canvasNonce, setCanvasNonce] = useState(0);

  // The vocabulary and the owner lists never change while the page is open.
  useEffect(() => {
    fetch(endpoints.mediaRelation.kinds(), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setKinds);

    // limit=2000 (the endpoint's ceiling), not the default 500: there are
    // already ~600 franchises, and a truncated list would silently hide owners
    // from the picker. Same reasoning as Orders.jsx.
    const fetchAll = (type) =>
      fetch(buildUrl(endpoints.resource(type).list(), { limit: 2000 }), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : []));
    Promise.all(SCOPE_TYPES.map(fetchAll)).then((lists) =>
      setOwners(
        Object.fromEntries(
          SCOPE_TYPES.map((type, i) => [SCOPE_TIERS[type].plural, lists[i]])
        )
      )
    );
  }, []);

  const ownerItems = useMemo(() => {
    return owners[SCOPE_TIERS[scopeType].plural].map((o) => ({
      id: o.system_id,
      label: getDisplayName(o, scopeType),
      searchText: [
        o[`${scopeType}_name_cn`],
        o[`${scopeType}_name_en`],
        o[`${scopeType}_name_alt`],
        o[`${scopeType}_name_roman`],
        o[`${scopeType}_name_jp`],
      ]
        .filter(Boolean)
        .join(" "),
    }));
  }, [owners, scopeType]);

  // One entries request and one relations request per scope, never per row.
  const loadScope = useCallback(async () => {
    if (!scopeId) {
      setCandidates([]);
      setCounts({});
      return;
    }
    const scopeParam = scopeParams(scopeType, scopeId);

    const [entries, rows] = await Promise.all([
      fetch(buildUrl(endpoints.order.candidates(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildUrl(endpoints.mediaRelation.inScope(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    setCandidates(entries);

    // Count both endpoints: an entry with only inbound relations still has
    // relations, and the badge would otherwise read zero.
    const tally = {};
    for (const row of rows) {
      for (const key of [
        `${row.from_type}:${row.from_id}`,
        `${row.to_type}:${row.to_id}`,
      ]) {
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    setCounts(tally);
  }, [scopeId, scopeType]);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((c) =>
      (c.search_names || [c.display_name || ""])
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [candidates, query]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    for (const c of visible) {
      if (!buckets.has(c.media_type)) buckets.set(c.media_type, []);
      buckets.get(c.media_type).push(c);
    }
    return [...buckets.entries()];
  }, [visible]);

  // The selection resolved to its entry record. The form writes a sentence
  // naming the entry, so a bare {media_type, entry_id} is not enough - and
  // this also drops a selection whose entry left the scope.
  const selectedEntry = useMemo(() => {
    if (!selected) return null;
    return (
      candidates.find(
        (c) =>
          c.media_type === selected.media_type &&
          String(c.entry_id) === String(selected.entry_id),
      ) || null
    );
  }, [candidates, selected]);

  const setScope = useCallback(
    (type, id) => {
      setPickedType(type);
      setSelected(null);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("owner", `${type}:${id}`);
          else next.delete("owner");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  function switchScope(type) {
    if (type === scopeType) return;
    // The previous pick belongs to the other tier and cannot carry over.
    setScope(type, null);
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <i className="fas fa-diagram-project text-brand"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-text tracking-tight leading-none">
            Relations
          </h1>
          <p className="text-xs text-text-faint font-medium mt-1">
            Prequels, alternatives, side stories and adaptations across every
            media type
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Left: pick a scope, then an entry */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg bg-surface-3/70">
            {SCOPE_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => switchScope(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-black transition-colors ${
                  scopeType === value
                    ? "bg-surface text-brand shadow-sm"
                    : "text-text-faint"
                }`}
              >
                {SCOPE_TIERS[value].label}
              </button>
            ))}
          </div>

          <ComboBox
            items={ownerItems}
            selectedId={scopeId}
            onSelect={(id) => setScope(scopeType, id)}
            onClear={() => setScope(scopeType, null)}
            placeholder={`Search ${SCOPE_TIERS[scopeType].plural}…`}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter entries…"
            className="border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />

          {!scopeId ? (
            <p className="text-center py-8 text-sm font-medium text-text-faint">
              Pick a {scopeType} to begin.
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-center py-8 text-sm font-medium text-text-faint">
              No entries in this {scopeType}.
            </p>
          ) : (
            // Capped at the canvas height so a franchise with a hundred
            // entries scrolls its own list instead of stretching the page and
            // pushing the graph out of view. pr-1 keeps the scrollbar off the
            // rows' right edge, where the relation counts sit.
            <div className="flex max-h-[36rem] flex-col gap-4 overflow-y-auto pr-1">
              {grouped.map(([mediaType, rows]) => (
                <div key={mediaType}>
                  <p className="text-[10px] font-black text-text-faint mb-1.5">
                    {mediaType}
                  </p>
                  <div className="flex flex-col gap-1">
                    {rows.map((c) => {
                      const key = `${c.media_type}:${c.entry_id}`;
                      const active =
                        selected &&
                        selected.media_type === c.media_type &&
                        selected.entry_id === c.entry_id;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            // The nonce climbs on every click, including a
                            // repeat of the entry already selected: closing
                            // the canvas panel and clicking the same row
                            // again has to reopen it, and the key alone
                            // would not have changed.
                            setSelected((current) => ({
                              media_type: c.media_type,
                              entry_id: c.entry_id,
                              nonce: (current?.nonce ?? 0) + 1,
                            }))
                          }
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors ${
                            active
                              ? "bg-brand/10 text-brand"
                              : "text-text-muted hover:bg-surface-2"
                          }`}
                        >
                          <FittedName
                            name={c.display_name}
                            className="min-w-0 flex-1 truncate"
                          />
                          {counts[key] ? (
                            <span className="shrink-0 rounded-full bg-surface-3 px-2 text-[10px] font-black text-text-muted">
                              {counts[key]}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: the scope's relations, as a canvas */}
        <div className="flex flex-col gap-4">
          <RelationGraph
            scopeType={scopeType}
            scopeId={scopeId}
            reloadNonce={canvasNonce}
            kinds={kinds}
            // The canvas refetches itself; the page only has to re-tally the
            // left pane's relation counts.
            onWrote={() => {
              loadScope();
              showToast("success", "Relations updated.");
            }}
            onError={(message) => showToast("error", message)}
            focusKey={
              selected ? `${selected.media_type}:${selected.entry_id}` : null
            }
            focusNonce={selected?.nonce}
            // A node click and a left-pane click set the same selection, so
            // the form below follows either. The nonce still climbs, which
            // costs nothing: the canvas is already showing that node's panel.
            onSelectNode={(key) => {
              const [mediaType, entryId] = key.split(":");
              setSelected((current) => ({
                media_type: mediaType,
                entry_id: entryId,
                nonce: (current?.nonce ?? 0) + 1,
              }));
            }}
            onPickGhostFranchise={(franchiseId) => {
              // A ghost lives in another franchise; following it moves the lens.
              setScope("franchise", franchiseId);
            }}
          />

          {/* The same three writes as a form, for when dragging between two
              nodes a scroll apart is the awkward way to say it. */}
          <RelationForm
            entry={selectedEntry}
            kinds={kinds}
            candidates={candidates}
            onWrote={() => {
              loadScope();
              setCanvasNonce((n) => n + 1);
              showToast("success", "Relations updated.");
            }}
            onError={(message) => showToast("error", message)}
          />
        </div>
      </div>
    </div>
  );
}
