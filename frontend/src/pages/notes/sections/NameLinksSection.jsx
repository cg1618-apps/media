// Frontend: renders one `name_links`-shaped section - a named bookmark
// (Resources). The description is optional, and the form asks for the
// group first; the links - each with an optional title -
// carry the value.
//
// A section flagged `kind_is_group` takes an optional Group per row, stored in
// `kind` and drawn as headings (kindGroups.jsx).
//
// Resources is a mixed section: `canEditRow` and `canMoveRow` (NotesContext's
// rowAccessFor) decide each row's Edit, Delete and handle, and a personal row
// carries the "Mine" chip. Provisional UI.
import { Fragment, useState } from "react";

import {
  EmptyHint,
  ItemActions,
  MineChip,
  ReorderHandle,
  ReorderList,
  ReorderRow,
  SaveCancel,
  SectionCard,
  isPersonal,
  ShowAllToggle,
  DraftPopup,
  inputCls,
  useEntryCap,
  useRowReorder,
} from "./ui";
import { GroupInput, useKindGroups } from "./kindGroups";
import { LinkPairPills, LinkPairsEditor } from "./LinkPairs";
import {
  hasLinkPair,
  pairsFromLinks,
  pairsIncomplete,
  pairsToLinks,
} from "./linkPairValues";

const empty = () => ({ title: "", group: "", links: [] });

const fromNote = (n) => ({
  title: n.title || "",
  group: n.kind || "",
  links: pairsFromLinks(n.links),
});

const toFields = (section, val) => ({
  title: val.title.trim() || null,
  links: pairsToLinks(val.links),
  ...(section.kind_is_group ? { kind: val.group.trim() || null } : {}),
});

function NameLinksForm({ val, setVal, groupOptions }) {
  return (
    <div className="space-y-1.5">
      <GroupInput
        value={val.group}
        onChange={(group) => setVal({ ...val, group })}
        options={groupOptions}
      />
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Description (optional)"
        className={inputCls}
      />
      <LinkPairsEditor
        pairs={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

export default function NameLinksSection({
  section,
  notes,
  canWrite,
  canEditRow = () => canWrite,
  canMoveRow,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onRenameGroup,
  optionValues,
  reordering,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(empty());
  const { rows, groupOptions, opensGroup, heading } = useKindGroups({
    section,
    notes,
    canEditRow,
    onRenameGroup,
    optionValues,
  });
  const cap = useEntryCap(rows, {
    keep: (row) => row.system_id === editId,
  });
  const reorder = useRowReorder({
    section,
    notes: rows,
    canWrite,
    canMoveRow,
    onReorder,
    reordering,
    cap,
  });

  // A bookmark with neither a name nor a link is nothing; a group alone does
  // not make one.
  const invalid = (val) =>
    pairsIncomplete(val.links) ||
    (!val.title.trim() && !hasLinkPair(val.links));

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
      personal={isPersonal(section)}
      count={notes.length}
      canWrite={canWrite}
      onAdd={() => setAdding(true)}
    >
      <ReorderList reorder={reorder}>
        {cap.visible.map((n, i) => {
          return (
            <Fragment key={n.system_id}>
              {opensGroup(n, cap.visible[i - 1]) && heading(n)}
              <ReorderRow
                reorder={reorder}
                id={n.system_id}
                className="flex gap-2 items-center group"
              >
                {editId !== n.system_id && (
                  <ReorderHandle reorder={reorder} note={n} />
                )}
                <span className="text-xs text-text-faint shrink-0">•</span>
                <div className="flex-1 min-w-0">
                  {editId === n.system_id ? (
                    <div>
                      <NameLinksForm
                        val={editVal}
                        setVal={setEditVal}
                        groupOptions={groupOptions}
                      />
                      <SaveCancel
                        onSave={saveEdit}
                        onCancel={() => setEditId(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.personal && <MineChip />}
                      {n.title && (
                        <span
                          data-testid="resource-title"
                          className="text-sm text-text-muted shrink-0"
                        >
                          {n.title}
                        </span>
                      )}
                      <LinkPairPills links={n.links} bare />
                    </div>
                  )}
                </div>
                {editId !== n.system_id && (
                  <ItemActions
                    canWrite={canEditRow(n)}
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
        <DraftPopup
          title={`Add to ${section.label}`}
          onClose={() => {
            setDraft(empty());
            setAdding(false);
          }}
        >
          <NameLinksForm
            val={draft}
            setVal={setDraft}
            groupOptions={groupOptions}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(empty());
              setAdding(false);
            }}
          />
        </DraftPopup>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
