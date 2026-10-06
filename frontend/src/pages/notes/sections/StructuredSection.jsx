// Frontend: renders one `structured`-shaped section - the shape whose fields
// come from the registry rather than from this file.
//
// Every other component in this directory knows its own columns: TextLinks
// renders a body and some links because that is what `text_links` means. This
// one renders whatever `section.fields` says, so a guide section that grows a
// "region" is a registry edit and nothing here changes. That is the whole
// reason the shape exists - the game guide sections need a dozen different
// field sets, and a component apiece would be a dozen near-identical files.
//
// Where a value is stored is also the registry's business: a field naming a
// `column` reads and writes that column at the top level of the payload, and
// one naming none lives under `fields[key]`. `fromNote`, `toPayload` and
// `readValue` are the only places that know the difference.
//
// Two more things come from the registry rather than from this file:
//   - a `names` field (a list of free-text names, always under `fields`) gets
//     NamesInput, which suggests `nameSuggestions` - the page's cast;
//   - a section naming `group_by` reads as one group per name of that field
//     (groupedRows.js). The GROUPS are ordered - by the owner's stored order,
//     `groupOrder`, which a drag of a group header rewrites through
//     `onGroupOrderChange`. Rows are not moved inside a group, since one row
//     can sit in two; a toggle switches to the flat list, where they are;
//   - a section naming `groupable_by` (a `select` field) gets a toggle that
//     reads it one group per value. Nothing extra is stored for it: the
//     groups follow the rows' `sort_index`, so moving a group or a row within
//     one saves the whole section's row order through `onReorder`.
// None of them names a section: any section declaring them gets them.
//
// And one field type points outside the notes: a `choice_node` field (a save's
// "At node") names a point in the owner game's choice graph. It is edited as a
// select of that game's points and read as the point's title, both drawn by
// components/game-choices/ChoiceNodeField. The game's id is the owner id the
// provider hands in, held in a context here so it does not have to be threaded
// through every form and row.
import { createContext, useContext, useState } from "react";

import {
  DragHandle,
  SortableItem,
  SortableList,
  arrayMove,
} from "../../../components/ui/Sortable";
import {
  ChoiceNodeName,
  ChoiceNodeSelect,
} from "../../../components/game-choices/ChoiceNodeField";
import NamesInput from "./NamesInput";
import {
  groupNotes,
  groupedIds,
  movedGroupOrder,
  movedRow,
  namesOf,
} from "./groupedRows";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  SaveCancel,
  SectionCard,
  ShowAllToggle,
  VISIBLE_ENTRIES,
  brandTagCls,
  capEntries,
  draftCls,
  inputCls,
  rowCls,
  tagCls,
  useEntryCap,
} from "./ui";
import AutoGrowTextarea from "../../../components/ui/AutoGrowTextarea";

// The owner's id, for a `choice_node` field: the game whose points it offers.
const OwnerIdContext = createContext(null);

const isBlank = (v) =>
  v == null ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && !v.length);

// A field's starting form value. Links and lists start as an array so the
// editors below never have to special-case a first row; a scalar starts on
// the registry's `default` where it declares one, which is how a new
// collectible opens on "not collected" and a new enemy on "to beat".
// Fields whose form value is an array rather than a string.
const ARRAY_TYPES = new Set(["links", "list", "names"]);

const emptyValue = (field) =>
  ARRAY_TYPES.has(field.type) ? [] : field.default || "";

const emptyDraft = (section) =>
  Object.fromEntries(section.fields.map((f) => [f.key, emptyValue(f)]));

// One saved row as form state. A column-backed field comes from the column,
// everything else from the `fields` blob.
const fromNote = (section, note) =>
  Object.fromEntries(
    section.fields.map((f) => {
      const raw = f.column ? note[f.column] : (note.fields || {})[f.key];
      if (ARRAY_TYPES.has(f.type)) return [f.key, raw || []];
      return [f.key, raw == null ? "" : String(raw)];
    }),
  );

// Form state as the API wants it: column fields at the top level, the rest
// under `fields`. Blank scalars are sent as null so the row stores a null
// column rather than an empty string, matching every other shape here.
const toPayload = (section, val) => {
  const payload = {};
  const fields = {};
  for (const f of section.fields) {
    const raw = val[f.key];
    let out;
    if (f.type === "links") {
      out = (raw || []).map((l) => l.trim()).filter(Boolean);
      if (!out.length) out = null;
    } else if (f.type === "names") {
      // Deduplicated, blanks dropped: the server refuses a blank name.
      out = [...new Set(namesOf(raw))];
      if (!out.length) out = null;
    } else if (f.type === "list") {
      out = (raw || []).filter((row) =>
        f.item_fields.some((item) => !isBlank(row[item.key])),
      );
      if (!out.length) out = null;
    } else {
      out = (raw || "").trim() || null;
    }
    if (f.column) payload[f.column] = out;
    else if (out !== null) fields[f.key] = out;
  }
  // An all-column section (controls, skills, endings) sends no blob at all
  // rather than an empty object, so its rows read back with `fields` null.
  payload.fields = Object.keys(fields).length ? fields : null;
  return payload;
};

// The row has to say something, and may have to say specific things. Mirrors
// _validate_structured in app/schemas/note.py so Save is disabled rather than
// returning a 422 - including the rule that a DEFAULTED field cannot be what
// makes a row worth storing, or an untouched draft would save itself on the
// strength of a status nobody chose.
const invalid = (section, val) => {
  const carrying = section.fields.filter((f) => !f.default);
  if (
    (carrying.length ? carrying : section.fields).every((f) =>
      isBlank(val[f.key]),
    )
  )
    return true;
  if (section.fields.some((f) => f.required && isBlank(val[f.key])))
    return true;
  return (section.require_any || []).some((group) =>
    group.every((key) => isBlank(val[key])),
  );
};

// --- Editors --------------------------------------------------------------

// A repeatable row of sub-fields: a build's armour pieces, a team's members.
// Held in form state and saved with the row, so it has no ids and no
// endpoint of its own - it is one value of one field.
//
// Its rows are dragged into order like every other list, which needs an id
// per row that follows the row as it moves - an index would hand the dragged
// row's identity (and its focused handle) to whichever row lands in its place.
// So the editor keeps a key per row beside the value, moved, removed and added
// with it. The keys are the editor's own and are never saved.
let listRowSeq = 0;
const mintListKey = () => `list-row-${listRowSeq++}`;

function ListEditor({ field, rows, onChange }) {
  const list = rows?.length ? rows : [];
  const [keys, setKeys] = useState(() => list.map(mintListKey));
  // A value that changed length from outside (not through this editor) gets
  // keys for its new rows rather than a crash; the ones it kept stay put.
  const ids = list.map((_, i) => keys[i] ?? `list-row-extra-${i}`);
  const update = (nextRows, nextKeys) => {
    setKeys(nextKeys);
    onChange(nextRows);
  };
  const setRow = (i, patch) =>
    onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (from, to) =>
    update(arrayMove(list, from, to), arrayMove(ids, from, to));
  const blank = Object.fromEntries(field.item_fields.map((f) => [f.key, ""]));

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {field.label}
      </p>
      <SortableList ids={ids} onMove={move}>
        {list.map((row, i) => (
          <SortableItem key={ids[i]} id={ids[i]} className="flex gap-1 items-start">
            {list.length > 1 && (
              <DragHandle label={`${field.label} row ${i + 1}`} className="pt-1.5" />
            )}
            {/* A one-column list is a list of texts; half a row would clip it. */}
            <div
              className={`flex-1 min-w-0 grid gap-1 ${
                field.item_fields.length > 1 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {field.item_fields.map((item) => (
                <ScalarInput
                  key={item.key}
                  field={item}
                  value={row[item.key] || ""}
                  onChange={(v) => setRow(i, { [item.key]: v })}
                  ariaLabel={`${field.label} row ${i + 1} ${item.label}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                update(
                  list.filter((_, j) => j !== i),
                  ids.filter((_, j) => j !== i),
                )
              }
              aria-label={`Remove ${field.label} row`}
              title="Remove"
              className="text-text-faint hover:text-danger px-1 pt-1.5"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          </SortableItem>
        ))}
      </SortableList>
      <button
        type="button"
        onClick={() => update([...list, blank], [...ids, mintListKey()])}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
      >
        + Add {field.label.toLowerCase()}
      </button>
    </div>
  );
}

// One text, textarea or select input. A select with no options is free text:
// the guide sections' type, group and tier are open vocabularies stored in
// the same columns a closed one would use.
function ScalarInput({ field, value, onChange, ariaLabel }) {
  const label = ariaLabel || field.label;
  if (field.type === "select" && field.options.length) {
    return (
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">{field.label}…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "textarea") {
    return (
      <AutoGrowTextarea
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        className={inputCls}
      />
    );
  }
  return (
    <input
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      className={inputCls}
    />
  );
}

function ChoiceNodeInput({ field, value, onChange }) {
  const ownerId = useContext(OwnerIdContext);
  return (
    <ChoiceNodeSelect
      field={field}
      gameId={ownerId}
      value={value}
      onChange={onChange}
      className={inputCls}
    />
  );
}

function StructuredForm({ section, val, setVal, nameSuggestions }) {
  return (
    <div className="space-y-2">
      {section.fields.map((field) => {
        const set = (v) => setVal({ ...val, [field.key]: v });
        if (field.type === "names") {
          return (
            <NamesInput
              key={field.key}
              label={field.label}
              value={val[field.key] || []}
              onChange={set}
              suggestions={nameSuggestions}
            />
          );
        }
        if (field.type === "links") {
          return (
            <LinksEditor key={field.key} links={val[field.key]} onChange={set} />
          );
        }
        if (field.type === "choice_node") {
          return (
            <ChoiceNodeInput
              key={field.key}
              field={field}
              value={val[field.key]}
              onChange={set}
            />
          );
        }
        if (field.type === "list") {
          return (
            <ListEditor
              key={field.key}
              field={field}
              rows={val[field.key]}
              onChange={set}
            />
          );
        }
        return (
          <ScalarInput
            key={field.key}
            field={field}
            value={val[field.key]}
            onChange={set}
          />
        );
      })}
    </div>
  );
}

// --- Read view ------------------------------------------------------------

// Where a field's saved value lives: its column, or the `fields` blob.
const readValue = (field, note) =>
  field.column ? note[field.column] : (note.fields || {})[field.key];

// The value that names the row, rendered as its heading so a list of enemies
// reads as names rather than as a wall of tags.
//
// The `title` column is what a name is stored in by convention, so it wins
// outright - `enemies` declares region BEFORE name (the form asks in that
// order), and taking the first filled text field would head every row with
// its region.
function rowHeading(section, note) {
  const field =
    section.fields.find(
      (f) => f.column === "title" && !isBlank(readValue(f, note)),
    ) ||
    section.fields.find((f) => f.type === "text" && !isBlank(readValue(f, note)));
  return field ? { field, value: readValue(field, note) } : null;
}

// A saved nested list, as a compact table. Column headings come from the
// field spec, so a list gains a column the same way a section gains a field.
function ListView({ field, rows }) {
  const used = field.item_fields.filter((item) =>
    rows.some((r) => !isBlank(r[item.key])),
  );
  if (!used.length) return null;
  return (
    <div className="mt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint mb-0.5">
        {field.label}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-faint">
            {used.map((item) => (
              <th
                key={item.key}
                className="text-left font-mono text-[10px] uppercase tracking-[0.1em] font-normal pb-0.5"
              >
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {used.map((item) => (
                <td key={item.key} className="py-0.5 pr-2 align-top text-text">
                  {row[item.key] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The one field a reader edits without opening the row: a stat's own value,
// which changes while playing rather than while writing the guide. Saves on
// blur, like the remark box on the detail pages.
function QuickEdit({ field, note, isAdmin, onUpdate }) {
  const value = readValue(field, note);
  if (!isAdmin) {
    return isBlank(value) ? null : (
      <span className={brandTagCls}>
        {field.label} {value}
      </span>
    );
  }
  const save = (next) => {
    if (String(next) === String(value ?? "")) return;
    const out = next.trim() || null;
    onUpdate(
      note.system_id,
      field.column
        ? { [field.column]: out }
        : { fields: { ...(note.fields || {}), [field.key]: out } },
    );
  };
  return (
    <label className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {field.label}
      </span>
      <input
        key={String(value ?? "")}
        defaultValue={value ?? ""}
        aria-label={field.label}
        onBlur={(e) => save(e.target.value)}
        className="w-16 border border-border-strong bg-surface text-text px-1.5 py-0.5 text-xs font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}

// What to call a row in a control's accessible name. The heading where there
// is one, so nine nested Add buttons do not all read "Add entry under entry".
function rowLabel(section, note) {
  return rowHeading(section, note)?.value || "entry";
}


// A `names` field on a saved row, as tags. In a grouped section the group's
// own name is left out of its rows - the header already says it - so what is
// left reads as "with whom".
function NamesView({ field, note, omit }) {
  const names = namesOf(readValue(field, note)).filter((n) => n !== omit);
  if (!names.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {field.label}
      </span>
      {names.map((name) => (
        <span key={name} className={`${tagCls} normal-case tracking-normal`}>
          {name}
        </span>
      ))}
    </span>
  );
}

// `groupedBy` is the key of the field the row is drawn grouped by, if any: its
// value is the group header, so the row does not repeat it.
function StructuredRow({ section, note, isAdmin, onUpdate, groupName, groupedBy }) {
  const heading = rowHeading(section, note);
  const headingKey = heading?.field.key;
  const namesFields = section.fields.filter((f) => f.type === "names");

  // Short scalars become tags, the bodies become paragraphs, and the lists
  // and links render themselves. The heading is drawn once and skipped here.
  const tags = section.fields.filter(
    (f) =>
      f.key !== headingKey &&
      f.key !== groupedBy &&
      !f.quick_edit &&
      (f.type === "text" || f.type === "select") &&
      !isBlank(readValue(f, note)),
  );
  const bodies = section.fields.filter(
    (f) => f.type === "textarea" && !isBlank(readValue(f, note)),
  );
  const quick = section.fields.filter((f) => f.quick_edit);
  const choiceNodes = section.fields.filter(
    (f) => f.type === "choice_node" && !isBlank(readValue(f, note)),
  );
  const ownerId = useContext(OwnerIdContext);

  return (
    <div className="flex-1 min-w-0 space-y-1">
      {/* Booleans, not lengths: `0 && ...` renders the 0. */}
      {(heading || tags.length > 0 || quick.length > 0 || choiceNodes.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {heading && (
            <span className="text-sm text-text font-medium">
              {heading.value}
            </span>
          )}
          {tags.map((f) => (
            <span key={f.key} className={tagCls}>
              {readValue(f, note)}
            </span>
          ))}
          {quick.map((f) => (
            <QuickEdit
              key={f.key}
              field={f}
              note={note}
              isAdmin={isAdmin}
              onUpdate={onUpdate}
            />
          ))}
          {choiceNodes.map((f) => (
            <ChoiceNodeName
              key={f.key}
              field={f}
              gameId={ownerId}
              value={readValue(f, note)}
              tagCls={tagCls}
            />
          ))}
        </div>
      )}
      {namesFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {namesFields.map((f) => (
            <NamesView
              key={f.key}
              field={f}
              note={note}
              omit={f.key === groupedBy ? groupName : undefined}
            />
          ))}
        </div>
      )}
      {bodies.map((f) => (
        <p key={f.key} className="text-sm text-text whitespace-pre-wrap">
          {readValue(f, note)}
        </p>
      ))}
      {section.fields
        .filter((f) => f.type === "list" && (readValue(f, note) || []).length)
        .map((f) => (
          <ListView key={f.key} field={f} rows={readValue(f, note)} />
        ))}
      <div className="flex flex-wrap gap-1">
        {section.fields
          .filter((f) => f.type === "links")
          .flatMap((f) => (readValue(f, note) || []).filter(Boolean))
          .map((l, i) => (
            <LinkPill key={i} url={l} />
          ))}
      </div>
    </div>
  );
}

// --- The tree -------------------------------------------------------------

// Rows arrive flat, each carrying the id of the row it sits under, so the
// page builds the shape. A flat section takes the same path with every row a
// root, which is why there is one renderer rather than two.
//
// A row whose parent_id names something not in this list is treated as a
// root. That should not happen - the router refuses a parent from another
// owner or section, and a delete cascades - but dropping such a row would
// hide it with nothing to say so, and showing it at the top level is the
// failure a reader can actually see and fix.
function buildTree(notes, hierarchical) {
  if (!hierarchical) return notes.map((note) => ({ note, children: [] }));

  const nodes = new Map(
    notes.map((note) => [note.system_id, { note, children: [] }]),
  );
  const roots = [];
  for (const note of notes) {
    const node = nodes.get(note.system_id);
    const parent = note.parent_id ? nodes.get(note.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

// --- Grouped read view ----------------------------------------------------

// The rows of a `group_by` section, one group per name (groupedRows.js).
//
// A group is what moves: dragged by the handle on its header (or stepped with
// the arrow keys on it), it saves the whole new order through
// `onGroupOrderChange`. The rows inside a group have no handle - their order
// is sort_index, and it does not matter. A row filed under two names is drawn
// under both, and editing it opens the form only where the edit was started.
//
// While a group order is being saved every group handle is disabled: the next
// move would be built from the order still in flight. The new order shows at
// once (`pending`), and a save that fails drops it again.
//
// The entry cap applies per GROUP, not per section: each group shows its first
// VISIBLE_ENTRIES rows and folds the rest behind its own toggle, and every
// group header stays on screen. The headers are what a reader scans and what
// drags, and a header folded out of sight could be neither found nor dropped
// on.
//
// Grouped by a `select` field instead (`groupBy` is `section.groupable_by`),
// a row is in exactly one group and `onRowsReorder` is given: then the rows
// get handles too, a row moves only within its own group, and a group move
// and a row move both save the section's whole row order in grouped order -
// which is what the groups' order is. `busy` is that save being in flight.
function GroupedRows({
  section,
  notes,
  isAdmin,
  groupBy = section.group_by,
  groupOrder,
  onGroupOrderChange,
  onRowsReorder,
  busy = false,
  onUpdate,
  onDelete,
  nameSuggestions,
}) {
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState({});
  // The order just saved, until the owner comes back with it. Keyed on the
  // order it was saved over, so a fresh `groupOrder` from the page wins
  // without an effect having to reset anything.
  const [pending, setPending] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  // The groups unfolded past the cap, by name (the nameless group by a key no
  // name can take, since a name is trimmed text and never empty).
  const [unfolded, setUnfolded] = useState(() => new Set());
  const order =
    pending && pending.base === groupOrder ? pending.order : groupOrder || [];

  const groupField = section.fields.find((f) => f.key === groupBy);
  const column = groupField?.type === "select" ? groupField.column : null;
  const groups = groupNotes(notes, groupBy, order, column);
  // The named groups come first and the nameless one, if any, last - so a
  // named group's index here is its index in `groups` too.
  const named = groups.filter((g) => g.name !== null);
  const unnamed = groups.filter((g) => g.name === null);
  const saveOrder = onRowsReorder || onGroupOrderChange;
  const canMove = isAdmin && Boolean(saveOrder) && named.length > 1;
  const locked = busy || savingOrder;
  const noName = `No ${(groupField?.label || "name").toLowerCase()}`;

  const unfold = (foldKey) =>
    setUnfolded((prev) => new Set(prev).add(foldKey));

  const move = (from, to) => {
    if (from === to) return;
    const next = movedGroupOrder(groups, from, to);
    if (onRowsReorder) {
      const byName = new Map(groups.map((g) => [g.name, g]));
      onRowsReorder(groupedIds([...next.map((n) => byName.get(n)), ...unnamed]));
      return;
    }
    setPending({ base: groupOrder, order: next });
    // An owner whose save is asynchronous returns its promise, and the
    // handles stay frozen until it settles. The owner reports its own
    // failure; here a failure only means the order shown goes back to the
    // owner's.
    const saving = onGroupOrderChange(next);
    if (typeof saving?.then !== "function") return;
    setSavingOrder(true);
    saving
      .catch(() => setPending(null))
      .finally(() => setSavingOrder(false));
  };

  const moveRow = (gi, from, to) => {
    // A row moved past its group's cap would fold out of sight.
    if (to >= VISIBLE_ENTRIES) unfold(groups[gi].name ?? "");
    onRowsReorder(groupedIds(movedRow(groups, gi, from, to)));
  };

  const renderGroup = (group, gi) => {
    const movable = canMove && group.name !== null;
    const foldKey = group.name ?? "";
    const expanded = unfolded.has(foldKey);
    const rows = capEntries(
      group.notes,
      expanded,
      (n) => editKey === `${group.name}|${n.system_id}`,
    );
    const toggleFold = () =>
      setUnfolded((prev) => {
        const next = new Set(prev);
        if (!next.delete(foldKey)) next.add(foldKey);
        return next;
      });
    const rowsMove = isAdmin && Boolean(onRowsReorder) && group.notes.length > 1;

    const renderRow = (n) => {
      const key = `${group.name}|${n.system_id}`;
      const Row = rowsMove ? SortableItem : "div";
      const rowProps = rowsMove ? { id: n.system_id } : {};
      if (editKey === key) {
        return (
          <Row key={key} {...rowProps}>
            <StructuredForm
              section={section}
              val={editVal}
              setVal={setEditVal}
              nameSuggestions={nameSuggestions}
            />
            <SaveCancel
              onSave={() => {
                if (invalid(section, editVal)) return;
                onUpdate(n.system_id, toPayload(section, editVal));
                setEditKey(null);
              }}
              onCancel={() => setEditKey(null)}
            />
          </Row>
        );
      }
      return (
        <Row key={key} {...rowProps} className="flex gap-2 items-start">
          {rowsMove && <DragHandle label={rowLabel(section, n)} className="pt-1" />}
          <StructuredRow
            section={section}
            note={n}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
            groupName={group.name}
            groupedBy={groupBy}
          />
          <ItemActions
            isAdmin={isAdmin}
            onEdit={() => {
              setEditKey(key);
              setEditVal(fromNote(section, n));
            }}
            onDelete={() => onDelete(n.system_id)}
          />
        </Row>
      );
    };

    const body = (
      <>
        <div data-testid="group-header" className="flex items-center gap-2 mb-1.5">
          {movable && <DragHandle label={`group ${group.name}`} />}
          <h5 className="text-sm font-medium text-text">
            {group.name ?? <span className="text-text-faint">{noName}</span>}
          </h5>
          <span className="font-mono text-[10px] text-text-faint tabular-nums">
            {group.notes.length}
          </span>
          <span className="flex-1 border-t border-dotted border-border-strong/60" />
        </div>
        <div className="ml-3 pl-3 border-l border-border space-y-2">
          {rowsMove ? (
            // Every row of the group is in the list, folded or not, so a
            // row's place is its place in the whole group and the last row
            // shown can still be moved down past the fold.
            <SortableList
              ids={group.notes.map((n) => n.system_id)}
              onMove={(from, to) => moveRow(gi, from, to)}
              disabled={locked}
            >
              {rows.map(renderRow)}
            </SortableList>
          ) : (
            rows.map(renderRow)
          )}
          <ShowAllToggle
            total={group.notes.length}
            expanded={expanded}
            onToggle={toggleFold}
          />
        </div>
      </>
    );
    const sectionProps = {
      "aria-label": group.name ?? noName,
      className: "border-t border-border pt-2 first:border-t-0 first:pt-0",
    };
    // Every named group is a sortable item, movable or not - the handle is
    // what makes it draggable, and only a movable group draws one.
    return group.name !== null ? (
      <SortableItem key={group.name} id={group.name} as="section" {...sectionProps}>
        {body}
      </SortableItem>
    ) : (
      <section key="__unnamed__" {...sectionProps}>
        {body}
      </section>
    );
  };

  return (
    <div className="space-y-3">
      <SortableList ids={named.map((g) => g.name)} onMove={move} disabled={locked}>
        {named.map(renderGroup)}
      </SortableList>
      {unnamed.map((g) => renderGroup(g, groups.length - 1))}
    </div>
  );
}

// --- Section --------------------------------------------------------------

// Whether a `group_by` or `groupable_by` section is read grouped: on until
// the reader turns it off, and remembered per section in this browser.
// Storage can be missing or refuse (a private window, blocked site data),
// which leaves the default.
function useGroupToggle(sectionKey) {
  const storageKey = `notes.grouped.${sectionKey}`;
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });
  const set = (next) => {
    setOn(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Not remembered; the toggle still works for this visit.
    }
  };
  return [on, set];
}

// `ownerId` is the owner row's id, which only a `choice_node` field reads.
export default function StructuredSection({ ownerId = null, ...props }) {
  return (
    <OwnerIdContext.Provider value={ownerId}>
      <StructuredSectionBody {...props} />
    </OwnerIdContext.Provider>
  );
}

function StructuredSectionBody({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  nameSuggestions = [],
  groupOrder = null,
  onGroupOrderChange,
  reordering = false,
}) {
  // `null` means the draft is a root; an id means it is a child of that row.
  // `false` means no draft is open, which is why this is not a boolean.
  const [addingUnder, setAddingUnder] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(section));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const groupableField =
    section.groupable_by && !section.hierarchical
      ? section.fields.find((f) => f.key === section.groupable_by)
      : null;
  const [groupedByField, setGroupedByField] = useGroupToggle(section.key);

  const closeDraft = () => {
    setDraft(emptyDraft(section));
    setAddingUnder(false);
  };

  const commit = () => {
    if (invalid(section, draft)) return;
    onCreate({
      section: section.key,
      ...toPayload(section, draft),
      ...(addingUnder ? { parent_id: addingUnder } : {}),
    });
    closeDraft();
  };

  const saveEdit = () => {
    if (invalid(section, editVal)) return;
    onUpdate(editId, toPayload(section, editVal));
    setEditId(null);
  };

  const tree = buildTree(notes, section.hierarchical);

  // The entry cap counts top-level rows only; a shown row shows all of its
  // children. A row stays on screen while it, or anything under it, is being
  // edited or is having a child drafted under it.
  const holds = (node, id) =>
    node.note.system_id === id || node.children.some((c) => holds(c, id));
  const cap = useEntryCap(tree, {
    keep: (node) =>
      (editId !== null && holds(node, editId)) ||
      (addingUnder && holds(node, addingUnder)),
  });

  // A move reorders SIBLINGS only - a row never changes parent by being
  // dragged - and then the whole section is renumbered in tree order.
  //
  // Sending just the moved row's siblings would be the smaller payload and
  // is refused: PATCH /api/notes/reorder takes ids naming exactly the section,
  // so a partial list is a loud 400 rather than a quiet partial renumber. That
  // is the right invariant to leave alone, and flattening depth-first is the
  // better answer anyway - `sort_index` ends up ascending in the order the
  // page actually draws, so a reader of the raw rows sees the tree's order too.
  //
  // `parent` is the node whose children are being reordered, or null for the
  // roots. The moved array is substituted by identity while flattening,
  // which is safe because these arrays are stable for the render.
  const move = (parent, from, to) => {
    const siblings = parent ? parent.children : tree;
    if (from === to || !onReorder) return;
    // A top-level row moved past the cap would fold out of sight.
    if (!parent && to >= VISIBLE_ENTRIES) cap.expand();

    const moved = arrayMove(siblings, from, to);
    const flatten = (nodes) =>
      (nodes === siblings ? moved : nodes).flatMap((node) => [
        node.note.system_id,
        ...flatten(node.children),
      ]);
    onReorder(section.key, flatten(tree));
  };

  const renderDraft = () => (
    <div className={draftCls}>
      <StructuredForm
        section={section}
        val={draft}
        setVal={setDraft}
        nameSuggestions={nameSuggestions}
      />
      <SaveCancel onSave={commit} onCancel={closeDraft} />
    </div>
  );

  // One sortable list per set of siblings, holding ALL of them even while the
  // top level is folded: a row's index is its place among every sibling, so
  // the move it makes is right, and the last row shown can still be moved
  // down past the fold (which unfolds the section). While a reorder of this
  // section is being saved (`reordering`) every handle is disabled.
  const renderNodes = (siblings, depth, parent = null) => {
    const sortable = isAdmin && Boolean(onReorder) && siblings.length > 1;
    const rows = (depth === 0 ? cap.visible : siblings).map((node) => {
      const n = node.note;
      const editing = editId === n.system_id;
      const Row = sortable ? SortableItem : "div";
      const rowProps = sortable ? { id: n.system_id } : {};
      return (
        <Row
          key={n.system_id}
          {...rowProps}
          className={depth === 0 ? rowCls : "pt-2"}
        >
          {editing ? (
            <div>
              <StructuredForm
                section={section}
                val={editVal}
                setVal={setEditVal}
                nameSuggestions={nameSuggestions}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              {sortable && (
                <DragHandle label={rowLabel(section, n)} className="pt-0.5" />
              )}
              <StructuredRow
                section={section}
                note={n}
                isAdmin={isAdmin}
                onUpdate={onUpdate}
              />
              {isAdmin && section.hierarchical && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(emptyDraft(section));
                    setAddingUnder(n.system_id);
                  }}
                  aria-label={`Add entry under ${rowLabel(section, n)}`}
                  title="Add a nested entry"
                  className="text-text-faint hover:text-brand text-xs px-1 shrink-0 mt-0.5"
                >
                  <i className="fas fa-plus"></i>
                </button>
              )}
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditId(n.system_id);
                  setEditVal(fromNote(section, n));
                }}
                onDelete={() => onDelete(n.system_id)}
              />
            </div>
          )}
          {/* Children and this row's draft both sit inside it, indented by a
              rule rather than by padding alone - at three levels deep the
              indent on its own stops reading as nesting. */}
          {(node.children.length > 0 || addingUnder === n.system_id) && (
            <div className="ml-3 pl-3 border-l border-border mt-2 space-y-2">
              {renderNodes(node.children, depth + 1, node)}
              {addingUnder === n.system_id && renderDraft()}
            </div>
          )}
        </Row>
      );
    });
    if (!sortable) return rows;
    return (
      <SortableList
        ids={siblings.map((node) => node.note.system_id)}
        onMove={(from, to) => move(parent, from, to)}
        disabled={reordering}
      >
        {rows}
      </SortableList>
    );
  };

  // A singleton section holds one row per owner, so once it has that
  // row the way to change it is Edit, and Add goes. The backend refuses a
  // second row either way; this keeps the button from offering one.
  const openDraft =
    section.singleton && notes.length
      ? null
      : () => {
          setDraft(emptyDraft(section));
          setAddingUnder(null);
        };

  // The header toggle between the grouped view and the flat list, for a
  // section grouped by `field`. Only shown once there is something to group.
  const groupToggle = (field) =>
    notes.length > 0 && (
      <button
        type="button"
        aria-pressed={groupedByField}
        onClick={() => setGroupedByField(!groupedByField)}
        className={`${groupedByField ? brandTagCls : tagCls} cursor-pointer`}
      >
        {`Group by ${(field?.label || "group").toLowerCase()}`}
      </button>
    );

  if (groupableField) {
    const on = groupedByField;
    return (
      <SectionCard
        label={section.label}
        count={notes.length}
        isAdmin={isAdmin}
        onAdd={openDraft}
        actions={groupToggle(groupableField)}
      >
        {on ? (
          <GroupedRows
            section={section}
            notes={notes}
            isAdmin={isAdmin}
            groupBy={section.groupable_by}
            onRowsReorder={onReorder ? (ids) => onReorder(section.key, ids) : undefined}
            busy={reordering}
            onUpdate={onUpdate}
            onDelete={onDelete}
            nameSuggestions={nameSuggestions}
          />
        ) : (
          <>
            {renderNodes(tree, 0)}
            <ShowAllToggle {...cap.toggle} />
          </>
        )}
        {addingUnder === null && renderDraft()}
        {!notes.length && addingUnder === false && <EmptyHint />}
      </SectionCard>
    );
  }

  // Grouped by a `names` field, where a row naming two names sits in two
  // groups - so a row cannot be moved within a group without also moving in
  // the other one. Rows are reordered in the flat list instead, behind the
  // same toggle a `groupable_by` section has; the groups then show the rows
  // in that order. Group order is the owner's own (`groupOrder`), untouched.
  if (section.group_by && !section.hierarchical) {
    const on = groupedByField;
    return (
      <SectionCard
        label={section.label}
        count={notes.length}
        isAdmin={isAdmin}
        onAdd={openDraft}
        actions={groupToggle(section.fields.find((f) => f.key === section.group_by))}
      >
        {on ? (
          <GroupedRows
            section={section}
            notes={notes}
            isAdmin={isAdmin}
            groupOrder={groupOrder}
            onGroupOrderChange={onGroupOrderChange}
            onUpdate={onUpdate}
            onDelete={onDelete}
            nameSuggestions={nameSuggestions}
          />
        ) : (
          <>
            {renderNodes(tree, 0)}
            <ShowAllToggle {...cap.toggle} />
          </>
        )}
        {addingUnder === null && renderDraft()}
        {!notes.length && addingUnder === false && <EmptyHint />}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      label={section.label}
      count={notes.length}
      isAdmin={isAdmin}
      onAdd={openDraft}
    >
      {renderNodes(tree, 0)}
      <ShowAllToggle {...cap.toggle} />
      {addingUnder === null && renderDraft()}
      {!notes.length && addingUnder === false && <EmptyHint />}
    </SectionCard>
  );
}
