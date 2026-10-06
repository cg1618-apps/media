// Frontend: renders one `music_track`-shaped section - OP, ED, 插入曲 Insert
// Song or OST. Every list holds the same row: the song's name, how far
// tracking that song has got (status), the episode it plays in, where to hear
// it (text-and-URL link pairs) and a remark. OP and ED add a Song Type, free
// text suggested from the section's `kind_category`.
//
// Above the songs, in the card's header, sits the LIST's own status - "All
// Done", "Not Done", ... - which lives in the hidden `music_status` section,
// in the row whose `kind` is this section's key. The provider hands that row
// in as `typeStatusNote`; a list with none reads as the registry default and
// gets its row the first time the status is changed.
import { useState } from "react";

import SuggestInput from "../../../components/forms/SuggestInput";
import { LinkPairPills, LinkPairsEditor } from "./LinkPairs";
import {
  hasLinkPair,
  pairsFromLinks,
  pairsIncomplete,
  pairsToLinks,
} from "./linkPairValues";
import {
  EmptyHint,
  ItemActions,
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
import AutoGrowTextarea from "../../../components/ui/AutoGrowTextarea";

const empty = (section) => ({
  title: "",
  kind: section.default_kind || "",
  status: "",
  locator: "",
  links: [],
  content: "",
});

const fromNote = (n, section) => ({
  title: n.title || "",
  kind: n.kind || section.default_kind || "",
  status: n.status || "",
  locator: n.locator || "",
  links: pairsFromLinks(n.links),
  content: n.content || "",
});

// Blanks go out as null so a PATCH clears the column rather than storing "".
// A list with no Song Type never sends a kind - the server refuses one there.
const toFields = (val, section) => ({
  title: val.title.trim() || null,
  ...(section.kind_category ? { kind: val.kind.trim() || null } : {}),
  status: val.status || null,
  locator: val.locator.trim() || null,
  links: pairsToLinks(val.links),
  content: val.content.trim() || null,
});

// Mirrors validate_note_payload, so the reader sees an inert Save rather than
// a 422: the row needs a name, status, episode, link or remark - the Song
// Type is prefilled, so it cannot be what makes a row worth storing - and a
// link label with no URL holds the save rather than being dropped.
const invalid = (val) =>
  pairsIncomplete(val.links) ||
  (!val.title.trim() &&
    !val.status &&
    !val.locator.trim() &&
    !hasLinkPair(val.links) &&
    !val.content.trim());

const selectCls = inputCls + " bg-surface";
const statusSelectCls =
  "border border-border-strong bg-surface text-text px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] focus:outline-none focus:ring-2 focus:ring-brand";

// The list's own status, in the card header. Admins get a compact select over
// the closed vocabulary; everyone else reads it as a tag.
function TypeStatus({ section, note, isAdmin, onCreate, onUpdate }) {
  const value = note?.status || section.type_status_default || "";
  if (!isAdmin) {
    return value ? <span className={brandTagCls}>{value}</span> : null;
  }
  const change = (status) => {
    if (!status || status === value) return;
    if (note) onUpdate(note.system_id, { status });
    else
      onCreate({
        section: section.type_status_section,
        kind: section.key,
        status,
      });
  };
  return (
    <select
      value={value}
      onChange={(e) => change(e.target.value)}
      aria-label={`${section.label} status`}
      className={statusSelectCls}
    >
      {section.type_statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function MusicTrackForm({ val, setVal, section, optionValues }) {
  const kindOptions = optionValues?.[section.kind_category] || [];
  const textOptions = section.link_text_category
    ? optionValues?.[section.link_text_category] || []
    : undefined;
  return (
    <div className="space-y-2">
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Song name (optional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        {section.kind_category && (
          <SuggestInput
            value={val.kind}
            onChange={(kind) => setVal({ ...val, kind })}
            options={kindOptions}
            placeholder="Song type"
            aria-label="Song type"
            className={inputCls}
          />
        )}
        <select
          value={val.status}
          onChange={(e) => setVal({ ...val, status: e.target.value })}
          aria-label="Song status"
          className={selectCls}
        >
          <option value="">Status</option>
          {section.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder || "Episode (optional)"}
          aria-label="Episode"
          className={inputCls}
        />
      </div>
      <LinkPairsEditor
        pairs={val.links}
        onChange={(links) => setVal({ ...val, links })}
        textOptions={textOptions}
      />
      <AutoGrowTextarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        placeholder="Remark (optional)"
        className={inputCls}
      />
    </div>
  );
}

export default function MusicTrackSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
  optionValues,
  typeStatusNote,
  onReorder,
  reordering,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(() => empty(section));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(() => empty(section));
  const cap = useEntryCap(notes, {
    keep: (row) => row.system_id === editId,
  });
  // Reorders this list's songs only. The list's own status lives in another
  // section (`music_status`) and is never one of these rows.
  const reorder = useRowReorder({ section, notes, isAdmin, onReorder, reordering, cap });

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(draft, section) });
    setDraft(empty(section));
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
      // A list with a status of its own opens even with no songs: the status
      // is the point of looking at it.
      openWhenEmpty={Boolean(section.type_status_section)}
      actions={
        section.type_status_section && (
          <TypeStatus
            section={section}
            note={typeStatusNote}
            isAdmin={isAdmin}
            onCreate={onCreate}
            onUpdate={onUpdate}
          />
        )
      }
    >
      <ReorderList reorder={reorder}>
        {cap.visible.map((n) => (
          <ReorderRow key={n.system_id} reorder={reorder} id={n.system_id} className={rowCls}>
            {editId === n.system_id ? (
              <div>
                <MusicTrackForm
                  val={editVal}
                  setVal={setEditVal}
                  section={section}
                  optionValues={optionValues}
                />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <ReorderHandle reorder={reorder} note={n} className="pt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.locator && <span className={tagCls}>{n.locator}</span>}
                    {n.title && <span className="text-sm font-semibold text-text">{n.title}</span>}
                    {n.kind && <span className={tagCls}>{n.kind}</span>}
                    {n.status && <span className={brandTagCls}>{n.status}</span>}
                  </div>
                  {n.content && (
                    <p className="text-sm text-text whitespace-pre-wrap">{n.content}</p>
                  )}
                  <LinkPairPills links={n.links} />
                </div>
                <ItemActions
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setEditId(n.system_id);
                    setEditVal(fromNote(n, section));
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
          <MusicTrackForm
            val={draft}
            setVal={setDraft}
            section={section}
            optionValues={optionValues}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(empty(section));
              setAdding(false);
            }}
          />
        </div>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
