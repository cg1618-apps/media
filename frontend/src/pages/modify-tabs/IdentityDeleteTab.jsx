// Frontend: delete tab page file for IdentityDeleteTab.
//
// Picks an identity the way IdentityModifyTab does, then confirms with the
// number of cast rows that will move to the character's main identity. That
// number travels with the request: the server answers 409 if it has moved
// since, so the admin never confirms one count and deletes another.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { SectionHeader } from "../../components/forms/FormField";
import { IDENTITIES_QUERY_KEY, IdentityPicker, useIdentities } from "./IdentityModifyTab";

export default function IdentityDeleteTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: identities = [], isLoading } = useIdentities();
  const [pickedId, setPickedId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const selected = identities.find((i) => i.system_id === pickedId) || null;

  async function remove() {
    if (!selected || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        endpoints.characterIdentity.remove(selected.system_id, selected.casting_count),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        showToast(
          "error",
          typeof data?.detail === "string" ? data.detail : "Failed to delete identity.",
        );
        await queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
        return;
      }
      showToast("success", `Identity ${selected.display_name} deleted.`);
      setPickedId(null);
      await queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
    } catch (err) {
      showToast("error", err.message || "Failed to delete identity.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-masks-theater" title="Delete Identity" />
      {!selected ? (
        <IdentityPicker
          identities={identities}
          isLoading={isLoading}
          onPick={(i) => setPickedId(i.system_id)}
          placeholder="Search identities to delete..."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text">
            Delete <span className="font-black">{selected.display_name}</span>, an identity of{" "}
            <span className="font-black">{selected.character_display_name}</span>?
          </p>
          <p className="text-sm text-text-muted">
            {selected.casting_count === 0
              ? "This identity is not cast anywhere."
              : `${selected.casting_count} cast row${selected.casting_count === 1 ? "" : "s"} move to ${selected.character_display_name}'s main identity. Where the main identity is already cast in the same entry, the two rows are combined.`}
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPickedId(null)}
              className="px-4 py-3 rounded-xl border border-border text-sm font-bold text-text-muted hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="flex items-center gap-2 px-6 py-3 bg-danger text-on-brand rounded-xl font-black text-sm hover:opacity-90 transition disabled:opacity-60"
            >
              <i className={`fas ${deleting ? "fa-spinner fa-spin" : "fa-trash"}`}></i>
              Delete Identity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
