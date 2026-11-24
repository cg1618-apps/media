// Frontend: the admin controls every entity detail page shares - character,
// person, studio and publisher.
//
// The four pages are hand-built (see the comments on Character.jsx,
// Person.jsx, Studio.jsx and Publisher.jsx). Each lets an admin jump to the
// full editor and write the remark without leaving the page - the remark goes
// through PATCH /api/{character|person|studio|publisher}/{system_id} with a
// partial body, and the page takes its state from the response - and lets a
// holder of self.list set its own rating, which the page saves through
// PUT /api/me/ratings (api/mutations/useMyRatingMutations.js).
//
// Character, person and studio also offer Autofill & update, labelled as on
// the media pages: POST /api/{kind}/{system_id}/autofill runs the MAL fill a
// save runs (blank columns only), and the page takes its state from the
// response exactly as it does from a PATCH.
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { MY_RATINGS } from "../../config/fieldOptions";
import { useToast } from "../../hooks/useToast";
import { Button, Eyebrow, Slip } from "../ui/primitives";

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

/**
 * `patch(payload, message)` for one entity: sends the partial
 * body, hands the response to `onSaved`, and toasts the outcome.
 */
export function useEntityPatch(ownerType, systemId, onSaved) {
  const { showToast } = useToast();
  return async function patch(payload, message) {
    try {
      const updated = await fetchJson(endpoints[ownerType].patch(systemId), {
        method: "PATCH",
        ...jsonBody(payload),
      });
      onSaved(updated);
      showToast("success", message || "Saved");
    } catch (err) {
      showToast("error", err.message || "Update failed");
    }
  };
}

/**
 * The dashed admin strip with its Edit button, placed as on the media pages.
 *
 * `onAutofilled` adds Autofill & update, which hands the response to it; a
 * page passes it only when the entity has something to fetch (a MAL link, and
 * for a person a seiyuu role). The server still answers 422 with the reason
 * if it has not, and that reason is the toast.
 */
export function AdminToolbar({ ownerType, systemId, onAutofilled }) {
  const navigate = useNavigate();
  return (
    <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
      <Eyebrow className="text-[11px] text-text-muted">Admin</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {/* Named for its entity as well as "Edit": a studio's or publisher's
            Related records slip has an Edit button of its own on the page. */}
        <Button
          aria-label={`Edit this ${ownerType}`}
          onClick={() => navigate(`/modify?id=${systemId}&type=${ownerType}`)}
        >
          Edit
        </Button>
        {onAutofilled && (
          <AutofillButton
            ownerType={ownerType}
            systemId={systemId}
            onAutofilled={onAutofilled}
          />
        )}
      </div>
    </div>
  );
}

/** Autofill & update: POST .../autofill, then the response is the page's state. */
function AutofillButton({ ownerType, systemId, onAutofilled }) {
  const { showToast } = useToast();
  const [autofilling, setAutofilling] = useState(false);

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const updated = await fetchJson(endpoints[ownerType].autofill(systemId), {
        method: "POST",
      });
      onAutofilled(updated);
      showToast("success", "Autofill completed");
    } catch (err) {
      showToast("error", err.message || "Autofill failed");
    } finally {
      setAutofilling(false);
    }
  }

  return (
    <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
      {autofilling ? "Autofilling…" : "Autofill & update"}
    </Button>
  );
}

/** The viewer's own rating as a select that saves on change. */
export function RatingSelect({ rating, onChange }) {
  return (
    <div className="space-y-1">
      <Eyebrow as="label" htmlFor="entity-my-rating">
        My rating
      </Eyebrow>
      <select
        id="entity-my-rating"
        value={rating || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={selectCls}
      >
        <option value="">Unrated</option>
        {MY_RATINGS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The remark as a textarea that saves on blur. Admin only. An emptied remark
 * saves as null; an untouched one does not save at all.
 */
export function RemarkEditor({ systemId, remark, onSave }) {
  return (
    <Slip title="Remarks">
      <textarea
        key={systemId}
        aria-label="Remark"
        defaultValue={remark || ""}
        onBlur={(e) => {
          const next = e.target.value.trim() === "" ? null : e.target.value;
          if (next !== (remark || null)) onSave(next);
        }}
        rows={4}
        placeholder="Add remarks…"
        className={selectCls}
      ></textarea>
    </Slip>
  );
}
