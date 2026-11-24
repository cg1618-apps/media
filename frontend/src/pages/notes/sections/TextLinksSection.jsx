// Frontend: renders one `text_links`-shaped section - a body of text plus any
// number of titled links, optionally tagged with an episode. One item is one `note`
// row, so adding or editing one touches only that row.
//
// A section flagged `kind_is_group` (彩蛋 Easter Eggs) takes an optional Group
// per row, stored in `kind` and drawn as headings (kindGroups.jsx).
//
// The review sections (優點 Advantages, 缺點 Disadvantages, 優缺點) are mixed
// and flagged `kind_choice`: public rows everyone reads, and each viewer's own
// personal rows. They are drawn as two groups, Public then Personal, each
// reordered on its own, and `canEditRow` / `canMoveRow` (NotesContext's
// rowAccessFor) decide each row's Edit, Delete and handle. A viewer who writes
// both kinds (`choosesKind`) picks a row's kind in its form. The Personal
// heading already says whose rows those are, so they carry no MineChip.
import { Fragment, useState } from "react";

import { useAuth } from "../../../contexts/AuthContext";

import {
  EmptyHint,
  ItemActions,
  KindChoice,
  ReorderHandle,
  ReorderList,
  ReorderRow,
  SaveCancel,
  SectionCard,
  isMixedByChoice,
  isPersonal,
  ShowAllToggle,
  brandTagCls,
  DraftPopup,
  inputCls,
  noteLabel,
  rowCls,
  useEntryCap,
  useRowReorder,
} from "./ui";
import AutoGrowTextarea from "../../../components/ui/AutoGrowTextarea";
import { LinkPairPills, LinkPairsEditor } from "./LinkPairs";
import {
  hasLinkPair,
  pairsFromLinks,
  pairsIncomplete,
  pairsToLinks,
} from "./linkPairValues";
import { GroupInput, groupHeadingCls, useKindGroups } from "./kindGroups";

// `personal` is the row's kind, which only a `kind_choice` section sends.
const empty = (personal = true) => ({
  locator: "",
  content: "",
  links: [],
  group: "",
  personal,
});

const fromNote = (n) => ({
  locator: n.locator || "",
  content: n.content || "",
  links: pairsFromLinks(n.links),
  group: n.kind || "",
  personal: Boolean(n.personal),
});

// The row as the API wants it: links with no URL dropped, blanks sent as null
// so the backend stores a null column rather than an empty string.
const toFields = (val, section) => ({
  locator: section.locator_placeholder ? val.locator.trim() || null : null,
  content: val.content.trim() || null,
  links: pairsToLinks(val.links),
  ...(section.kind_is_group ? { kind: val.group.trim() || null } : {}),
});

// `choosesKind` draws the Personal / Public choice above the fields.
function TextLinksForm({ val, setVal, section, groupOptions, choosesKind }) {
  return (
    <div className="space-y-2">
      {choosesKind && (
        <KindChoice
          personal={val.personal}
          onChange={(personal) => setVal({ ...val, personal })}
        />
      )}
      <GroupInput
        value={val.group}
        onChange={(group) => setVal({ ...val, group })}
        options={groupOptions}
      />
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
      <LinkPairsEditor
        pairs={val.links}
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

// One group of a `kind_choice` section's rows: its heading, in the look of
// kindGroups' in-card headings, then its rows, sortable among themselves.
function KindGroup({ label, reorder, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 pt-1 first:pt-0">
        <p data-testid="kind-heading" className={groupHeadingCls}>
          {label}
        </p>
      </div>
      <ReorderList reorder={reorder}>{children}</ReorderList>
    </div>
  );
}

export default function TextLinksSection({
  section,
  notes,
  canWrite,
  canEditRow = () => canWrite,
  canMoveRow,
  choosesKind = false,
  defaultPersonal = true,
  onCreate,
  onUpdate,
  onSwitchKind,
  onDelete,
  onReorder,
  onRenameGroup,
  optionValues,
  reordering,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(() => empty(defaultPersonal));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(empty());
  const { rows, groupOptions, opensGroup, heading } = useKindGroups({
    section,
    notes,
    canEditRow,
    onRenameGroup,
    optionValues,
  });
  const keep = (row) => row.system_id === editId;
  const cap = useEntryCap(rows, { keep });
  const reorder = useRowReorder({
    section,
    notes: rows,
    canWrite,
    canMoveRow,
    onReorder,
    reordering,
    cap,
  });
  // A `kind_choice` section's two groups, each with its own fold and its own
  // reorder. Built for every section, since hooks cannot be conditional, and
  // drawn only for that one.
  const byKind = Boolean(section.kind_choice);
  const publicRows = rows.filter((n) => !n.personal);
  const personalRows = rows.filter((n) => n.personal);
  const publicCap = useEntryCap(publicRows, { keep });
  const personalCap = useEntryCap(personalRows, { keep });
  const publicReorder = useRowReorder({
    section,
    notes: publicRows,
    canWrite,
    canMoveRow,
    onReorder,
    reordering,
    cap: publicCap,
    personal: false,
  });
  const personalReorder = useRowReorder({
    section,
    notes: personalRows,
    canWrite,
    canMoveRow,
    onReorder,
    reordering,
    cap: personalCap,
    personal: true,
  });

  // An empty row is never worth storing, and some sections demand a body. A
  // row is a description, titled links, or both. A title with no URL waits
  // for its URL rather than being dropped.
  const invalid = (val) => {
    if (pairsIncomplete(val.links)) return true;
    const content = val.content.trim();
    if (section.desc_required && !content) return true;
    // An episode comment with no episode names nothing. Mirrors
    // validate_note_payload so Save is disabled rather than returning a 422.
    if (section.locator_required && !val.locator.trim()) return true;
    return !content && !hasLinkPair(val.links);
  };

  const resetDraft = () => {
    setDraft(empty(defaultPersonal));
    setAdding(false);
  };

  // A `kind_choice` section always sends the kind - the one picked, or the
  // viewer's only one - so the server never falls back on its default for a
  // viewer that writes public rows alone.
  const commit = () => {
    if (invalid(draft)) return;
    onCreate({
      section: section.key,
      ...toFields(draft, section),
      ...(byKind ? { personal: draft.personal } : {}),
    });
    resetDraft();
  };

  // A changed kind goes through the kind endpoint, carrying the content when
  // that changed too; content alone is the ordinary PATCH.
  const saveEdit = () => {
    if (invalid(editVal)) return;
    const note = notes.find((n) => n.system_id === editId);
    const fields = toFields(editVal, section);
    const switched =
      byKind && onSwitchKind && note && editVal.personal !== Boolean(note.personal);
    if (switched) {
      const changed =
        JSON.stringify(fields) !== JSON.stringify(toFields(fromNote(note), section));
      onSwitchKind(editId, editVal.personal, changed ? fields : undefined);
    } else {
      onUpdate(editId, fields);
    }
    setEditId(null);
  };

  // The server switches the kind of the viewer's own rows only: every
  // personal row it is served is the viewer's, and a public row is when its
  // author is the signed-in account.
  const userId = useAuth()?.userId;
  const editChoosesKind = (n) =>
    choosesKind && (Boolean(n.personal) || (Boolean(userId) && n.author_id === userId));

  const renderRow = (n, rowReorder, visible, i) => (
    <Fragment key={n.system_id}>
      {opensGroup(n, visible[i - 1]) && heading(n)}
      <ReorderRow reorder={rowReorder} id={n.system_id} className={rowCls}>
        {editId === n.system_id ? (
          <div>
            <TextLinksForm
              val={editVal}
              setVal={setEditVal}
              section={section}
              groupOptions={groupOptions}
              choosesKind={editChoosesKind(n)}
            />
            <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            <ReorderHandle reorder={rowReorder} note={n} className="pt-0.5" />
            <div className="flex-1 space-y-1">
              {n.locator && <span className={brandTagCls}>{n.locator}</span>}
              {n.content && (
                <p className="text-sm text-text whitespace-pre-wrap">
                  {n.content}
                </p>
              )}
              <LinkPairPills links={n.links} />
              {!n.content && !(n.links || []).filter(Boolean).length && (
                <span className="text-xs text-text-faint">(empty)</span>
              )}
            </div>
            <MoveToSection
              canWrite={canEditRow(n)}
              note={n}
              targets={section.move_targets}
              onMove={(key) => onUpdate(n.system_id, { section: key })}
            />
            <ItemActions
              canWrite={canEditRow(n)}
              onEdit={() => {
                setEditId(n.system_id);
                setEditVal(fromNote(n));
              }}
              onDelete={() => onDelete(n.system_id)}
            />
          </div>
        )}
      </ReorderRow>
    </Fragment>
  );

  // Public first, then the viewer's own; a group with no rows is not drawn.
  const kindGroups = [
    ["Public", publicCap, publicReorder],
    ["Personal", personalCap, personalReorder],
  ].filter(([, groupCap]) => groupCap.toggle.total > 0);

  return (
    <SectionCard
      label={section.label}
      personal={isPersonal(section)}
      mixed={isMixedByChoice(section)}
      count={notes.length}
      canWrite={canWrite}
      onAdd={() => setAdding(true)}
    >
      {byKind ? (
        kindGroups.map(([label, groupCap, groupReorder]) => (
          <Fragment key={label}>
            <KindGroup label={label} reorder={groupReorder}>
              {groupCap.visible.map((n, i) =>
                renderRow(n, groupReorder, groupCap.visible, i),
              )}
            </KindGroup>
            <ShowAllToggle {...groupCap.toggle} />
          </Fragment>
        ))
      ) : (
        <>
          <ReorderList reorder={reorder}>
            {cap.visible.map((n, i) => renderRow(n, reorder, cap.visible, i))}
          </ReorderList>
          <ShowAllToggle {...cap.toggle} />
        </>
      )}
      {adding && (
        <DraftPopup title={`Add to ${section.label}`} onClose={resetDraft}>
          <TextLinksForm
            val={draft}
            setVal={setDraft}
            section={section}
            groupOptions={groupOptions}
            choosesKind={choosesKind}
          />
          <SaveCancel onSave={commit} onCancel={resetDraft} />
        </DraftPopup>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
