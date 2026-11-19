// Frontend: page component file for NeedsWork - every 待補充 Needs Work mark.
//
// The entries and groups whose data is not complete yet - sequels not added,
// names missing, an official name not released - grouped by their note, so
// marks that share a note read as one piece of work. The unnoted group comes
// last. manage.requests, the key /api/needs-work asks: super and the admin.
//
// Per row: the note can be changed (which moves the row to another group)
// and the mark cleared. A mark is set on the Add form, the Modify editor or
// the 待補充 badge on the record's own page.
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  useClearNeedsWork,
  useNeedsWorkList,
  useSetNeedsWork,
} from "../../api/mutations/useNeedsWork";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ConfirmModal from "../../components/modals/ConfirmModal";
import NeedsWorkNoteInput from "../../components/needs-work/NeedsWorkNoteInput";
import { Button, Chip, Eyebrow } from "../../components/ui/primitives";
import { useToast } from "../../hooks/useToast";
import { formatRequestDate } from "../../lib/requests";

export const NO_NOTE = "No note";

export default function NeedsWork() {
  const { showToast } = useToast();
  const { data, isLoading, error } = useNeedsWorkList();
  const setMark = useSetNeedsWork();
  const clearMark = useClearNeedsWork();
  // The item whose note is being edited, and the item whose mark is clearing.
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState("");
  const [clearing, setClearing] = useState(null);
  const groups = data ?? [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  function startEditing(item) {
    setNote(item.note ?? "");
    setEditing(item);
  }

  async function confirmNote() {
    try {
      await setMark.mutateAsync({
        ownerType: editing.owner_type,
        ownerId: editing.owner_id,
        note,
      });
      showToast("success", "Note saved");
      setEditing(null);
    } catch (err) {
      showToast("error", err.message || "Save failed");
    }
  }

  async function confirmClear() {
    try {
      await clearMark.mutateAsync({
        ownerType: clearing.owner_type,
        ownerId: clearing.owner_id,
      });
      showToast("success", "Mark cleared");
      setClearing(null);
    } catch (err) {
      showToast("error", err.message || "Clear failed");
    }
  }

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-4xl font-semibold text-text leading-none">
          待補充 Needs Work
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Entries and groups whose data is not complete yet, grouped by note
        </p>
      </header>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText="Loading marks..."
          errorTitle="Error loading marks."
        />
      ) : total === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing is marked. Mark an entry or a group with the 待補充 badge on
          its page, or while adding or modifying it.
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.note ?? ""}
            data-testid="needs-work-group"
            aria-label={group.note ?? NO_NOTE}
            className="space-y-2"
          >
            <h2 className="flex items-baseline gap-3">
              <span
                className={`font-display text-xl font-semibold ${
                  group.note ? "text-text" : "text-text-faint"
                }`}
              >
                {group.note ?? NO_NOTE}
              </span>
              <Eyebrow>{group.items.length}</Eyebrow>
            </h2>
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left">
                    <th className="px-3 py-2 w-32"><Eyebrow>Type</Eyebrow></th>
                    <th className="px-3 py-2"><Eyebrow>Name</Eyebrow></th>
                    <th className="px-3 py-2 w-40"><Eyebrow>Marked</Eyebrow></th>
                    <th className="px-3 py-2 w-48"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr
                      key={`${item.owner_type}:${item.owner_id}`}
                      data-testid="needs-work-row"
                      className="border-b border-border last:border-b-0 align-top"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Chip tone={item.is_tier ? "brand" : "ink"}>{item.type_label}</Chip>
                      </td>
                      <td className="px-3 py-2">
                        <Link to={item.nav_path} className="text-text hover:text-brand transition">
                          {item.display_name || (
                            <span className="text-text-faint">Untitled</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-text-faint">
                        {formatRequestDate(item.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" onClick={() => startEditing(item)}>
                            Edit note
                          </Button>
                          <Button size="sm" kind="danger" onClick={() => setClearing(item)}>
                            Clear
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {editing && (
        <ConfirmModal
          title="Edit note"
          confirmLabel="Save"
          busy={setMark.isPending}
          onConfirm={confirmNote}
          onCancel={() => setEditing(null)}
        >
          <label
            htmlFor="needs-work-note"
            className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1"
          >
            Note (optional)
          </label>
          <NeedsWorkNoteInput id="needs-work-note" value={note} onChange={setNote} />
          <p className="text-xs text-text-faint mt-2">
            Marks with the same note are listed together.
          </p>
        </ConfirmModal>
      )}

      {clearing && (
        <ConfirmModal
          title="Clear mark"
          confirmLabel="Clear"
          danger
          busy={clearMark.isPending}
          onConfirm={confirmClear}
          onCancel={() => setClearing(null)}
        >
          Clear the 待補充 mark on {clearing.display_name || "this item"}? Its note
          goes with it.
        </ConfirmModal>
      )}
    </div>
  );
}
