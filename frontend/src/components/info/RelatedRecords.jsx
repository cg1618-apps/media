// Frontend: the records related to a studio, a publisher or a franchise, each
// with this side's remark.
//
// A relation is mutual and each side keeps its own remark, read and replaced
// whole through GET/PUT /api/{studio|publisher|franchise}/{id}/related.
// Studios and publishers are one pool - a studio may relate to a publisher
// and the other way round (company_relation) - so their picker offers both,
// each marked with its kind, and every row carries `kind`. A franchise relates
// to franchises only. Adding a record here shows this one on the other's page
// too, with no remark until that page writes one; removing it here removes it
// from both.
//
// The server leaves out every related record the viewer may not see, so this
// renders what it is given. A viewer with nothing to see and nothing to edit
// gets no frame at all. The editor's candidates are the kinds' lists, which
// are filtered the same way, so a hidden record is never offered either.
//
// A record added while editing offers a tick for each record above it on the
// list, all ticked: "also relate the new one to these". Saving sends the ticked
// ones as the item's `also_related_to`, and the server writes each as an
// ordinary pair. Unticking one is how a pair is left unrelated - nothing about
// it is stored. Only the records above are offered, so two records added in one
// edit share one tick, on the later.
//
// The same component is the detail page's box and the Modify form's: it saves
// through its own button either way, never with the form.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { useEntityHref } from "../../lib/entityPath";
import { getDisplayName } from "../../lib/naming";
import ComboBox from "../forms/ComboBox";
import { inputCls } from "../forms/FormField";
import { Button, Slip } from "../ui/primitives";

const linkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

const ENTITY_NAMES = ["name_en", "name_cn", "name_jp", "name_alt"];

// Each kind a picker can offer: what it is called, where its list lives, and
// which of its fields a search reads. The franchise list asks for every
// franchise: the list route pages at 500 by default, and there are more.
const CANDIDATES = {
  studio: {
    label: "Studio",
    list: () => endpoints.studio.list(),
    nameFields: ENTITY_NAMES,
  },
  publisher: {
    label: "Publisher",
    list: () => endpoints.publisher.list(),
    nameFields: ENTITY_NAMES,
  },
  franchise: {
    label: "Franchise",
    list: () => `${endpoints.resource("franchise").list()}?limit=2000`,
    nameFields: [
      "franchise_name_en",
      "franchise_name_cn",
      "franchise_name_roman",
      "franchise_name_jp",
      "franchise_name_alt",
    ],
  },
};

// What each page's box is called, where its relations live, and which kinds
// it may relate to.
const KINDS = {
  studio: {
    title: "Related companies",
    related: (id) => endpoints.studio.related(id),
    relatesTo: ["studio", "publisher"],
  },
  publisher: {
    title: "Related companies",
    related: (id) => endpoints.publisher.related(id),
    relatesTo: ["studio", "publisher"],
  },
  franchise: {
    title: "Related franchises",
    related: (id) => endpoints.franchise.related(id),
    relatesTo: ["franchise"],
  },
};

// A record's name: the server's display_name where the list carries one, the
// SPA's own fallback chain where it does not (the franchise list).
export function recordName(record, kind) {
  return record.display_name || getDisplayName(record, kind) || "Unknown";
}

const keyOf = (kind, id) => `${kind}:${id}`;

function RecordLink({ type, record }) {
  const entityHref = useEntityHref();
  const path = entityHref(type, record);
  return path ? (
    <Link to={path} className={linkCls}>
      {record.display_name}
    </Link>
  ) : (
    <span>{record.display_name}</span>
  );
}

// The records the picker offers, as ComboBox items, without those already
// chosen and without the record the page is about. `candidates` is
// {kind: records}; a kind's label marks its rows when more than one is
// offered.
export function pickerItems(candidates, chosen, self) {
  const taken = new Set([
    ...chosen.map((r) => keyOf(r.kind, r.system_id)),
    keyOf(self.kind, self.id),
  ]);
  const kinds = Object.keys(candidates);
  return kinds.flatMap((kind) =>
    (candidates[kind] || [])
      .filter((r) => !taken.has(keyOf(kind, r.system_id)))
      .map((r) => {
        const name = recordName(r, kind);
        return {
          id: keyOf(kind, r.system_id),
          label: kinds.length > 1 ? `${name} · ${CANDIDATES[kind].label}` : name,
          searchText: [name, ...CANDIDATES[kind].nameFields.map((f) => r[f])]
            .filter(Boolean)
            .join(" "),
        };
      }),
  );
}

// The records the draft row at `index` may also be related to: the rows above
// it, when it was added in this edit; none for a row that was already related.
export function alsoRelatedTargets(draft, index) {
  return draft[index]?.isNew ? draft.slice(0, index) : [];
}

export default function RelatedRecords({ type, recordId, isAdmin }) {
  const kind = KINDS[type];
  const { showToast } = useToast();
  const [related, setRelated] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!recordId) return undefined;
    let cancelled = false;
    fetchJson(kind.related(recordId))
      .then((rows) => !cancelled && setRelated(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setRelated([]));
    return () => {
      cancelled = true;
    };
  }, [kind, recordId]);

  const start = () => {
    setDraft(related.map((r) => ({ ...r, remark: r.remark ?? "" })));
    setEditing(true);
    // Fetched when editing starts, not before: it is every record.
    Promise.all(
      kind.relatesTo.map((k) =>
        fetchJson(CANDIDATES[k].list())
          .then((rows) => [k, Array.isArray(rows) ? rows : []])
          .catch(() => [k, []]),
      ),
    ).then((pairs) => setCandidates(Object.fromEntries(pairs)));
  };

  const setRemark = (key, remark) =>
    setDraft(draft.map((r) => (keyOf(r.kind, r.system_id) === key ? { ...r, remark } : r)));

  const toggleAlso = (key, otherKey) =>
    setDraft(
      draft.map((r) =>
        keyOf(r.kind, r.system_id) !== key
          ? r
          : {
              ...r,
              unticked: r.unticked.includes(otherKey)
                ? r.unticked.filter((k) => k !== otherKey)
                : [...r.unticked, otherKey],
            },
      ),
    );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rows = await fetchJson(kind.related(recordId), {
        method: "PUT",
        ...jsonBody({
          relations: draft.map((r, index) => {
            const item = { kind: r.kind, id: r.system_id, remark: r.remark.trim() || null };
            if (!r.isNew) return item;
            const also = alsoRelatedTargets(draft, index).filter(
              (o) => !r.unticked.includes(keyOf(o.kind, o.system_id)),
            );
            return {
              ...item,
              also_related_to: also.map((o) => ({ kind: o.kind, id: o.system_id })),
            };
          }),
        }),
      });
      setRelated(rows || []);
      setEditing(false);
      showToast("success", `${kind.title} saved`);
    } catch (e) {
      showToast("error", e.message || `${kind.title} failed to save`);
    } finally {
      setSaving(false);
    }
  }, [draft, kind, recordId, showToast]);

  if (!recordId) return null;
  if (related.length === 0 && !isAdmin) return null;

  const actions =
    isAdmin && !editing ? (
      <Button size="sm" onClick={start}>
        Edit
      </Button>
    ) : null;

  return (
    <Slip title={kind.title} actions={actions}>
      {!editing ? (
        related.length === 0 ? (
          <p className="text-sm text-text-faint">No {kind.title.toLowerCase()}.</p>
        ) : (
          <ul className="space-y-1.5" aria-label={kind.title}>
            {related.map((r) => (
              <li key={keyOf(r.kind, r.system_id)} className="text-sm">
                <RecordLink type={r.kind || type} record={r} />
                {kind.relatesTo.length > 1 && (
                  <span className="ml-1.5 font-mono text-[10px] text-text-faint">
                    {CANDIDATES[r.kind]?.label}
                  </span>
                )}
                {r.remark && <span className="text-text-muted"> — {r.remark}</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2" aria-label={`${kind.title} being edited`}>
            {draft.map((r, index) => {
              const key = keyOf(r.kind, r.system_id);
              const name = recordName(r, r.kind);
              const targets = alsoRelatedTargets(draft, index);
              return (
                <li key={key} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-text">
                      {name}
                      {kind.relatesTo.length > 1 && (
                        <span className="text-text-faint"> · {CANDIDATES[r.kind]?.label}</span>
                      )}
                    </span>
                    <input
                      className={`${inputCls} flex-1 min-w-0`}
                      value={r.remark}
                      onChange={(e) => setRemark(key, e.target.value)}
                      placeholder="Remark (optional)"
                      aria-label={`Remark for ${name}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft(draft.filter((x) => keyOf(x.kind, x.system_id) !== key))
                      }
                      aria-label={`Remove ${name}`}
                      className="text-text-faint hover:text-danger px-1"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                  {targets.length > 0 && (
                    <fieldset
                      aria-label={`Also relate ${name} to`}
                      className="mt-1 ml-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted"
                    >
                      <span className="text-text-faint">Also related to:</span>
                      {targets.map((o) => {
                        const otherKey = keyOf(o.kind, o.system_id);
                        return (
                          <label key={otherKey} className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!r.unticked.includes(otherKey)}
                              onChange={() => toggleAlso(key, otherKey)}
                            />
                            {recordName(o, o.kind)}
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                </li>
              );
            })}
          </ul>
          <ComboBox
            items={pickerItems(candidates, draft, { kind: type, id: recordId })}
            selectedId={null}
            inputText=""
            onSelect={(key) => {
              const [pickedKind, id] = key.split(":");
              const record = (candidates[pickedKind] || []).find((c) => String(c.system_id) === id);
              if (record) {
                setDraft([
                  ...draft,
                  {
                    kind: pickedKind,
                    system_id: record.system_id,
                    public_id: record.public_id,
                    display_name: recordName(record, pickedKind),
                    remark: "",
                    isNew: true,
                    unticked: [],
                  },
                ]);
              }
            }}
            onType={() => {}}
            onClear={() => {}}
            placeholder="Search to add…"
          />
          <div className="flex gap-2">
            <Button kind="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Slip>
  );
}
