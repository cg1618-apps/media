// Frontend: renders one `text_links`-shaped section - a body of text plus any
// number of links, optionally tagged with an episode. One item is one `note`
// row, so adding or editing one touches only that row.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  ReorderHandle,
  ReorderList,
  ReorderRow,
  SaveCancel,
  SectionCard,
  ShowAllToggle,
  brandTagCls,
  draftCls,
  inputCls,
  noteLabel,
  rowCls,
  useEntryCap,
  useRowReorder,
} from "./ui";
import AutoGrowTextarea from "../../../components/ui/AutoGrowTextarea";

const empty = () => ({ locator: "", content: "", links: [""] });

const fromNote = (n) => ({
  locator: n.locator || "",
  content: n.content || "",
  links: n.links?.length ? n.links : [""],
});

// The row as the API wants it: blank links dropped, blanks sent as null so the
// backend stores a null column rather than an empty string.
const toFields = (val, section) => ({
  locator: section.locator_placeholder ? val.locator.trim() || null : null,
  content: val.content.trim() || null,
  links: (val.links || []).map((l) => l.trim()).filter(Boolean),
});

function TextLinksForm({ val, setVal, section }) {
  return (
    <div className="space-y-2">
      {section.locator_placeholder && (
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder}
          className={inputCls}
        />
      )}
      <AutoGrowTextarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        placeholder={
          section.desc_required
            ? "Description (required)"
            : "Description (optional)"
        }
        className={inputCls}
      />
      <LinksEditor
        links={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

// The "Move to…" list beside a row's Edit and Delete, on a section whose
// registry entry names `move_targets` - the 待辦 buckets, each offering the
// owner's others. Picking one rewrites the row's `section`, and the backend
// appends it to the end of that section. Shown to whoever may edit the row,
// as Edit and Delete are; the ResourceTree's native select is the pattern.
function MoveToSection({ canWrite, note, targets, onMove }) {
  if (!canWrite || !targets?.length) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onMove(e.target.value);
      }}
      aria-label={`Move ${noteLabel(note)} to`}
      title="Move to another list"
      className="h-6 max-w-[9rem] shrink-0 px-1 text-xs border border-border-strong bg-surface text-text-muted focus:outline-none focus:ring-2 focus:ring-brand"
    >
      <option value="">Move to…</option>
      {targets.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

export default function TextLinksSection({
  section,
  notes,
  canWrite,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  reordering,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(empty());
  const cap = useEntryCap(notes, {
    keep: (row) => row.system_id === editId,
  });
  const reorder = useRowReorder({ section, notes, canWrite, onReorder, reordering, cap });

  // An empty row is never worth storing, and some sections demand a body.
  const invalid = (val) => {
    const content = val.content.trim();
    if (section.desc_required && !content) return true;
    // An episode comment with no episode names nothing. Mirrors
    // validate_note_payload so Save is disabled rather than returning a 422.
    if (section.locator_required && !val.locator.trim()) return true;
    return !content && !(val.links || []).some((l) => l.trim());
  };

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(draft, section) });
    setDraft(empty());
    setAdding(false);
  };

  const saveEdit = () => {
    if (invalid(editVal)) return;
    onUpdate(editId, toFields(editVal, section));
    setEditId(null);
  };

  return (
    <SectionCard
      label={section.label}
      count={notes.length}
      canWrite={canWrite}
      onAdd={() => setAdding(true)}
    >
      <ReorderList reorder={reorder}>
        {cap.visible.map((n) => (
          <ReorderRow key={n.system_id} reorder={reorder} id={n.system_id} className={rowCls}>
            {editId === n.system_id ? (
              <div>
                <TextLinksForm val={editVal} setVal={setEditVal} section={section} />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <ReorderHandle reorder={reorder} note={n} className="pt-0.5" />
                <div className="flex-1 space-y-1">
                  {n.locator && <span className={brandTagCls}>{n.locator}</span>}
                  {n.content && (
                    <p className="text-sm text-text whitespace-pre-wrap">{n.content}</p>
                  )}
                  {(n.links || []).filter(Boolean).map((l, j) => (
                    <LinkPill key={j} url={l} />
                  ))}
                  {!n.content && !(n.links || []).filter(Boolean).length && (
                    <span className="text-xs text-text-faint">(empty)</span>
                  )}
                </div>
                <MoveToSection
                  canWrite={canWrite}
                  note={n}
                  targets={section.move_targets}
                  onMove={(key) => onUpdate(n.system_id, { section: key })}
                />
                <ItemActions
                  canWrite={canWrite}
                  onEdit={() => {
                    setEditId(n.system_id);
                    setEditVal(fromNote(n));
                  }}
                  onDelete={() => onDelete(n.system_id)}
                />
              </div>
            )}
          </ReorderRow>
        ))}
      </ReorderList>
      <ShowAllToggle {...cap.toggle} />
      {adding && (
        <div className={draftCls}>
          <TextLinksForm val={draft} setVal={setDraft} section={section} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(empty());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
