// Frontend: the records related to a studio or a franchise, each with this
// side's remark.
//
// A relation is mutual and each side keeps its own remark (studio_relation and
// franchise_relation, read and replaced whole through GET/PUT
// /api/{studio|franchise}/{id}/related). Adding a record here shows this one
// on the other's page too, with no remark until that page writes one;
// removing it here removes it from both.
//
// The server leaves out every related record the viewer may not see, so this
// renders what it is given. A viewer with nothing to see and nothing to edit
// gets no frame at all. The editor's candidates are the kind's list, which is
// filtered the same way, so a hidden record is never offered either.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { useEntityHref } from "../../lib/entityPath";
import ComboBox from "../forms/ComboBox";
import { inputCls } from "../forms/FormField";
import { Button, Slip } from "../ui/primitives";

const linkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

// What each kind is called, where its list lives, and which of its fields a
// picker search reads. The candidate list asks for every franchise: the list
// route pages at 500 by default, and there are more than that.
const KINDS = {
  studio: {
    title: "Related studios",
    related: (id) => endpoints.studio.related(id),
    candidates: () => endpoints.studio.list(),
    nameFields: ["name_en", "name_cn", "name_jp", "name_alt"],
  },
  franchise: {
    title: "Related franchises",
    related: (id) => endpoints.franchise.related(id),
    candidates: () => `${endpoints.resource("franchise").list()}?limit=2000`,
    nameFields: [
      "franchise_name_en",
      "franchise_name_cn",
      "franchise_name_roman",
      "franchise_name_jp",
      "franchise_name_alt",
    ],
  },
};

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
// chosen and without the record the page is about.
export function pickerItems(records, chosen, selfId, nameFields = []) {
  const taken = new Set([...chosen.map((r) => r.system_id), selfId]);
  return records
    .filter((r) => !taken.has(r.system_id))
    .map((r) => ({
      id: r.system_id,
      label: r.display_name || "Unknown",
      searchText: [r.display_name, ...nameFields.map((f) => r[f])]
        .filter(Boolean)
        .join(" "),
    }));
}

export default function RelatedRecords({ type, recordId, isAdmin }) {
  const kind = KINDS[type];
  const { showToast } = useToast();
  const [related, setRelated] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [candidates, setCandidates] = useState([]);
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
    fetchJson(kind.candidates())
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  };

  const setRemark = (id, remark) =>
    setDraft(draft.map((r) => (r.system_id === id ? { ...r, remark } : r)));

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rows = await fetchJson(kind.related(recordId), {
        method: "PUT",
        ...jsonBody({
          relations: draft.map((r) => ({
            id: r.system_id,
            remark: r.remark.trim() || null,
          })),
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
              <li key={r.system_id} className="text-sm">
                <RecordLink type={type} record={r} />
                {r.remark && <span className="text-text-muted"> — {r.remark}</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2" aria-label={`${kind.title} being edited`}>
            {draft.map((r) => (
              <li key={r.system_id} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-text">{r.display_name}</span>
                <input
                  className={`${inputCls} flex-1 min-w-0`}
                  value={r.remark}
                  onChange={(e) => setRemark(r.system_id, e.target.value)}
                  placeholder="Remark (optional)"
                  aria-label={`Remark for ${r.display_name}`}
                />
                <button
                  type="button"
                  onClick={() => setDraft(draft.filter((x) => x.system_id !== r.system_id))}
                  aria-label={`Remove ${r.display_name}`}
                  className="text-text-faint hover:text-danger px-1"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </li>
            ))}
          </ul>
          <ComboBox
            items={pickerItems(candidates, draft, recordId, kind.nameFields)}
            selectedId={null}
            inputText=""
            onSelect={(id) => {
              const record = candidates.find((c) => c.system_id === id);
              if (record) setDraft([...draft, { ...record, remark: "" }]);
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
