// Frontend: the admin controls every entity detail page shares - character,
// person, studio and publisher.
//
// The four pages are hand-built (see the comments on Character.jsx,
// Person.jsx, Studio.jsx and Publisher.jsx), and each lets an admin do three
// things without leaving the page: jump to the full editor, set my rating,
// and write the remark. The rating and remark go through
// PATCH /api/{character|person|studio|publisher}/{system_id} with a partial
// body, and the page takes its state from the response.
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

/** The dashed admin strip with Quick edit, placed as on the media pages. */
export function AdminToolbar({ ownerType, systemId }) {
  const navigate = useNavigate();
  return (
    <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
      <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">Admin</Eyebrow>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/modify?id=${systemId}&type=${ownerType}`)}>
          Quick edit
        </Button>
      </div>
    </div>
  );
}

/** My rating as a select that saves on change. Admin only. */
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
