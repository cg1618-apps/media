// Frontend: renders one `name_links`-shaped section - a named bookmark
// (Resources). The title is optional; the links carry the value.
//
// A section flagged `kind_is_group` takes an optional Group per row, stored in
// `kind`. Once any row has one, the card draws one heading per group, in the
// order each group first appears among the rows, and the ungrouped rows last
// under "Other" (groupedRows.js). The rows are drawn - and folded, and
// reordered - in that grouped order, so dragging a row above another group's
// first row moves its whole group up. With no row grouped the list is the
// plain one.
import { Fragment, useId, useState } from "react";

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
  draftCls,
  inputCls,
  useEntryCap,
  useRowReorder,
} from "./ui";
import { groupNotes } from "./groupedRows";

const OTHER = "Other";

const empty = () => ({ title: "", group: "", links: [""] });

const fromNote = (n) => ({
  title: n.title || "",
  group: n.kind || "",
  links: n.links?.length ? n.links : [""],
});

const toFields = (section, val) => ({
  title: val.title.trim() || null,
  links: (val.links || []).map((l) => l.trim()).filter(Boolean),
  ...(section.kind_is_group ? { kind: val.group.trim() || null } : {}),
});

function NameLinksForm({ val, setVal, groupOptions }) {
  const listId = useId();
  return (
    <div className="space-y-1.5">
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Name (optional)"
        className={inputCls}
      />
      {groupOptions && (
        <>
          <input
            value={val.group}
            onChange={(e) => setVal({ ...val, group: e.target.value })}
            placeholder="Group (optional)"
            list={listId}
            className={inputCls}
          />
          <datalist id={listId}>
            {groupOptions.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </>
      )}
      <LinksEditor
        links={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

export default function NameLinksSection({
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
  // Ungrouped, groupNotes returns one nameless group holding every row in
  // order, so `rows` is `notes` and no heading is drawn.
  const groups = section.kind_is_group
    ? groupNotes(notes, null, [], "kind")
    : [{ name: null, notes }];
  const grouped = groups.some((g) => g.name !== null);
  const groupOf = new Map(
    groups.flatMap((g) => g.notes.map((n) => [n.system_id, g.name ?? OTHER])),
  );
  const rows = groups.flatMap((g) => g.notes);
  const groupOptions = section.kind_is_group
    ? groups.map((g) => g.name).filter((name) => name !== null)
    : null;
  const cap = useEntryCap(rows, {
    keep: (row) => row.system_id === editId,
  });
  const reorder = useRowReorder({
    section,
    notes: rows,
    isAdmin,
    onReorder,
    reordering,
    cap,
  });

  // A bookmark with neither a name nor a link is nothing; a group alone does
  // not make one.
  const invalid = (val) =>
    !val.title.trim() && !(val.links || []).some((l) => l.trim());

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(section, draft) });
    setDraft(empty());
    setAdding(false);
  };

  const saveEdit = () => {
    if (invalid(editVal)) return;
    onUpdate(editId, toFields(section, editVal));
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
        {cap.visible.map((n, i) => {
          const group = groupOf.get(n.system_id);
          // A heading opens each run of one group's rows.
          const opensGroup =
            grouped && group !== groupOf.get(cap.visible[i - 1]?.system_id);
          return (
            <Fragment key={n.system_id}>
              {opensGroup && (
                <p
                  data-testid="group-heading"
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint pt-1 first:pt-0"
                >
                  {group}
                </p>
              )}
              <ReorderRow
                reorder={reorder}
                id={n.system_id}
                className="flex gap-2 items-center group"
              >
                {editId !== n.system_id && <ReorderHandle reorder={reorder} note={n} />}
                <span className="text-xs text-text-faint shrink-0">•</span>
                <div className="flex-1 min-w-0">
                  {editId === n.system_id ? (
                    <div>
                      <NameLinksForm
                        val={editVal}
                        setVal={setEditVal}
                        groupOptions={groupOptions}
                      />
                      <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.title && (
                        <span
                          data-testid="resource-title"
                          className="text-sm text-text-muted shrink-0"
                        >
                          {n.title}
                        </span>
                      )}
                      {(n.links || []).filter(Boolean).map((l, j) => (
                        <LinkPill key={j} url={l} />
                      ))}
                    </div>
                  )}
                </div>
                {editId !== n.system_id && (
                  <ItemActions
                    isAdmin={isAdmin}
                    onEdit={() => {
                      setEditId(n.system_id);
                      setEditVal(fromNote(n));
                    }}
                    onDelete={() => onDelete(n.system_id)}
                  />
                )}
              </ReorderRow>
            </Fragment>
          );
        })}
      </ReorderList>
      <ShowAllToggle {...cap.toggle} />
      {adding && (
        <div className={draftCls}>
          <NameLinksForm val={draft} setVal={setDraft} groupOptions={groupOptions} />
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
