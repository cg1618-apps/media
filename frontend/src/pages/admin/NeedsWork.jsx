// Frontend: page component file for NeedsWork - every 待補充 Needs Work mark.
//
// The entries and groups whose data is not complete yet - sequels not added,
// names missing, an official name not released. A mark whose note is one of
// the common notes (the Needs Work Note option values) is listed under that
// note, so marks that share it read as one piece of work; every other note
// is listed under Other, each row showing its own; the unnoted marks come
// last. manage.requests, the key /api/needs-work asks: super and the admin.
//
// Per row: the note can be changed (which moves the row to another section)
// and the mark cleared. A mark is set on the Add form, the Modify editor or
// the 待補充 badge on the record's own page.
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  useClearNeedsWork,
  useNeedsWorkCommonNotes,
  useNeedsWorkList,
  useSetNeedsWork,
} from "../../api/mutations/useNeedsWork";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ConfirmModal from "../../components/modals/ConfirmModal";
import NeedsWorkNoteInput from "../../components/needs-work/NeedsWorkNoteInput";
import { Button, Chip, Eyebrow } from "../../components/ui/primitives";
import { useToast } from "../../hooks/useToast";
import { needsWorkSections } from "../../lib/needsWork";
import { formatRequestDate } from "../../lib/requests";

export default function NeedsWork() {
  const { showToast } = useToast();
  const { data, isLoading: listLoading, error } = useNeedsWorkList();
  // The sections wait for the common notes; if they fail to load, every
  // noted mark is listed under Other rather than the page failing.
  const { data: commonNotes, isLoading: notesLoading } = useNeedsWorkCommonNotes();
  const isLoading = listLoading || notesLoading;
  const setMark = useSetNeedsWork();
  const clearMark = useClearNeedsWork();
  // The item whose note is being edited, and the item whose mark is clearing.
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState("");
  const [clearing, setClearing] = useState(null);
  const sections = needsWorkSections(data, commonNotes);
  const total = sections.reduce((n, s) => n + s.items.length, 0);

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
          Entries and groups whose data is not complete yet, grouped by common note
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
        sections.map((section) => (
          <section
            key={section.key}
            data-testid="needs-work-group"
            aria-label={section.label}
            className="space-y-2"
          >
            <h2 className="flex items-baseline gap-3">
              <span
                className={`font-display text-xl font-semibold ${
                  section.kind === "common" ? "text-text" : "text-text-faint"
                }`}
              >
                {section.label}
              </span>
              <Eyebrow>{section.items.length}</Eyebrow>
            </h2>
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left">
                    <th className="px-3 py-2 w-32"><Eyebrow>Type</Eyebrow></th>
                    <th className="px-3 py-2"><Eyebrow>Name</Eyebrow></th>
                    {section.kind === "other" && (
                      <th className="px-3 py-2"><Eyebrow>Note</Eyebrow></th>
                    )}
                    <th className="px-3 py-2 w-40"><Eyebrow>Marked</Eyebrow></th>
                    <th className="px-3 py-2 w-48"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
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
                      {section.kind === "other" && (
                        <td className="px-3 py-2 text-text-muted whitespace-pre-wrap">
                          {item.note}
                        </td>
                      )}
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
            className="block text-[10px] font-bold text-text-faint mb-1"
          >
            Note (optional)
          </label>
          <NeedsWorkNoteInput id="needs-work-note" value={note} onChange={setNote} />
          <p className="text-xs text-text-faint mt-2">
            Marks with a common note are listed under it; any other note is
            listed under Other.
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
