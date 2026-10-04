// Frontend: renders one `episode_text`-shaped section - a comment pinned to a
// locator (an episode, a chapter, a scene, a timestamp - the registry supplies
// the label), with a kind dropdown where the registry declares one
// (op_ed_changes, highlights) and none where it does not, and any number of
// URL links where the registry says the section `takes_links` (op_ed_changes) -
// edited and drawn exactly as a text_links row's are.
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
  rowCls,
  tagCls,
  useEntryCap,
  useRowReorder,
} from "./ui";

const empty = () => ({ locator: "", kind: "", content: "", links: [""] });

const fromNote = (n) => ({
  locator: n.locator || "",
  kind: n.kind || "",
  content: n.content || "",
  links: n.links?.length ? n.links : [""],
});

// Links go out only where the section takes them, blank ones dropped - the same
// list text_links sends. A section that takes none sends no `links` key, so an
// edit there never touches the column.
const toFields = (val, section) => ({
  locator: val.locator.trim() || null,
  kind: section.kinds?.length ? val.kind.trim() || null : null,
  content: val.content.trim() || null,
  ...(section.takes_links && {
    links: (val.links || []).map((l) => l.trim()).filter(Boolean),
  }),
});

function EpisodeTextForm({ val, setVal, section }) {
  const hasKinds = (section.kinds || []).length > 0;
  return (
    <div className="space-y-2">
      <div className={hasKinds ? "grid grid-cols-2 gap-2" : ""}>
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder ?? "Where"}
          className={inputCls}
        />
        {hasKinds && (
          <select
            value={val.kind}
            onChange={(e) => setVal({ ...val, kind: e.target.value })}
            className={inputCls}
          >
            <option value="">— Type —</option>
            {section.kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        rows={2}
        placeholder={
          section.desc_required ? "Description (required)" : "Description"
        }
        className={inputCls}
      />
      {section.takes_links && (
        <LinksEditor
          links={val.links}
          onChange={(links) => setVal({ ...val, links })}
        />
      )}
    </div>
  );
}

export default function EpisodeTextSection({
  section,
  notes,
  isAdmin,
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
  // Dragged rather than sorted by locator: a locator is free text - an
  // episode, but also a chapter, a boss, a scene or a source - so there is no
  // order it could be sorted into.
  const reorder = useRowReorder({ section, notes, isAdmin, onReorder, reordering, cap });

  // A locator alone is a legitimate note, and so is text alone - except where
  // the section is only about where it points, and then the locator is the one
  // part that cannot be missing. Mirrors validate_note_payload so the reader
  // sees a disabled Save rather than a 422.
  const invalid = (val) => {
    if (section.locator_required && !val.locator.trim()) return true;
    // The mirror of the above: `questions` takes an optional source but the
    // question itself is the point.
    if (section.desc_required && !val.content.trim()) return true;
    return !val.locator.trim() && !val.content.trim();
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
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      <ReorderList reorder={reorder}>
        {cap.visible.map((n) => (
          <ReorderRow key={n.system_id} reorder={reorder} id={n.system_id} className={rowCls}>
            {editId === n.system_id ? (
              <div>
                <EpisodeTextForm val={editVal} setVal={setEditVal} section={section} />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <ReorderHandle reorder={reorder} note={n} className="pt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.locator && <span className={brandTagCls}>{n.locator}</span>}
                    {n.kind && <span className={tagCls}>{n.kind}</span>}
                  </div>
                  {n.content && (
                    <p className="text-sm text-text whitespace-pre-wrap">{n.content}</p>
                  )}
                  {section.takes_links &&
                    (n.links || [])
                      .filter(Boolean)
                      .map((l, j) => <LinkPill key={j} url={l} />)}
                </div>
                <ItemActions
                  isAdmin={isAdmin}
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
          <EpisodeTextForm val={draft} setVal={setDraft} section={section} />
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
