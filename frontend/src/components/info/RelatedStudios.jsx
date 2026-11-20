// Frontend: the studios related to a studio, each with this side's remark.
//
// A relation is mutual and each side keeps its own remark (studio_relation,
// read and replaced whole through GET/PUT /api/studio/{id}/related). Adding a
// studio here shows this studio on the other's page too, with no remark until
// that page writes one; removing it here removes it from both.
//
// The server leaves out every related studio the viewer may not see, so this
// renders what it is given. A viewer with nothing to see and nothing to edit
// gets no frame at all. The editor's candidates are the studio list, which
// is filtered the same way, so a hidden studio is never offered either.
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

function StudioLink({ studio }) {
  const entityHref = useEntityHref();
  const path = entityHref("studio", studio);
  return path ? (
    <Link to={path} className={linkCls}>
      {studio.display_name}
    </Link>
  ) : (
    <span>{studio.display_name}</span>
  );
}

// The studios the picker offers, as ComboBox items, without those already
// chosen and without the studio the page is about.
export function pickerItems(studios, chosen, selfId) {
  const taken = new Set([...chosen.map((s) => s.system_id), selfId]);
  return studios
    .filter((s) => !taken.has(s.system_id))
    .map((s) => ({
      id: s.system_id,
      label: s.display_name || "Unknown",
      searchText: [s.display_name, s.name_en, s.name_cn, s.name_jp, s.name_alt]
        .filter(Boolean)
        .join(" "),
    }));
}

export default function RelatedStudios({ studioId, isAdmin }) {
  const { showToast } = useToast();
  const [related, setRelated] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!studioId) return undefined;
    let cancelled = false;
    fetchJson(endpoints.studio.related(studioId))
      .then((rows) => !cancelled && setRelated(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setRelated([]));
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  const start = () => {
    setDraft(related.map((r) => ({ ...r, remark: r.remark ?? "" })));
    setEditing(true);
    // Fetched when editing starts, not before: it is every studio.
    fetchJson(endpoints.studio.list())
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  };

  const setRemark = (id, remark) =>
    setDraft(draft.map((r) => (r.system_id === id ? { ...r, remark } : r)));

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rows = await fetchJson(endpoints.studio.related(studioId), {
        method: "PUT",
        ...jsonBody({
          relations: draft.map((r) => ({
            studio_id: r.system_id,
            remark: r.remark.trim() || null,
          })),
        }),
      });
      setRelated(rows || []);
      setEditing(false);
      showToast("success", "Related studios saved");
    } catch (e) {
      showToast("error", e.message || "Related studios failed to save");
    } finally {
      setSaving(false);
    }
  }, [draft, studioId, showToast]);

  if (!studioId) return null;
  if (related.length === 0 && !isAdmin) return null;

  const actions =
    isAdmin && !editing ? (
      <Button size="sm" onClick={start}>
        Edit
      </Button>
    ) : null;

  return (
    <Slip title="Related studios" actions={actions}>
      {!editing ? (
        related.length === 0 ? (
          <p className="text-sm text-text-faint">No related studios.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Related studios">
            {related.map((r) => (
              <li key={r.system_id} className="text-sm">
                <StudioLink studio={r} />
                {r.remark && <span className="text-text-muted"> — {r.remark}</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2" aria-label="Related studios being edited">
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
            items={pickerItems(candidates, draft, studioId)}
            selectedId={null}
            inputText=""
            onSelect={(id) => {
              const studio = candidates.find((c) => c.system_id === id);
              if (studio) setDraft([...draft, { ...studio, remark: "" }]);
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
