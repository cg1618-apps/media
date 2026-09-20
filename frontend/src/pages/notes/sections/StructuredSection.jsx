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
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  MoveButtons,
  SaveCancel,
  SectionCard,
  brandTagCls,
  draftCls,
  inputCls,
  rowCls,
  tagCls,
} from "./ui";

const isBlank = (v) =>
  v == null ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && !v.length);

// A field's empty form value. Links and lists start as an array so the
// editors below never have to special-case a first row.
const emptyValue = (field) =>
  field.type === "links" || field.type === "list" ? [] : "";

const emptyDraft = (section) =>
  Object.fromEntries(section.fields.map((f) => [f.key, emptyValue(f)]));

// One saved row as form state. A column-backed field comes from the column,
// everything else from the `fields` blob.
const fromNote = (section, note) =>
  Object.fromEntries(
    section.fields.map((f) => {
      const raw = f.column ? note[f.column] : (note.fields || {})[f.key];
      if (f.type === "links" || f.type === "list") return [f.key, raw || []];
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
// returning a 422.
const invalid = (section, val) => {
  if (section.fields.every((f) => isBlank(val[f.key]))) return true;
  if (section.fields.some((f) => f.required && isBlank(val[f.key]))) return true;
  return (section.require_any || []).some((group) =>
    group.every((key) => isBlank(val[key])),
  );
};

// --- Editors --------------------------------------------------------------

// A repeatable row of sub-fields: a build's armour pieces, a team's members.
// Held in form state and saved with the row, so it has no ids and no
// endpoint of its own - it is one value of one field.
function ListEditor({ field, rows, onChange }) {
  const list = rows?.length ? rows : [];
  const setRow = (i, patch) =>
    onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const blank = Object.fromEntries(field.item_fields.map((f) => [f.key, ""]));

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {field.label}
      </p>
      {list.map((row, i) => (
        <div key={i} className="flex gap-1 items-start">
          <MoveButtons
            label={`${field.label} row`}
            atTop={i === 0}
            atBottom={i === list.length - 1}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
          />
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-1">
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
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            aria-label={`Remove ${field.label} row`}
            title="Remove"
            className="text-text-faint hover:text-danger px-1 pt-1.5"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, blank])}
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
      <textarea
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
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

function StructuredForm({ section, val, setVal }) {
  return (
    <div className="space-y-2">
      {section.fields.map((field) => {
        const set = (v) => setVal({ ...val, [field.key]: v });
        if (field.type === "links") {
          return (
            <LinksEditor key={field.key} links={val[field.key]} onChange={set} />
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


function StructuredRow({ section, note, isAdmin, onUpdate }) {
  const heading = rowHeading(section, note);
  const headingKey = heading?.field.key;

  // Short scalars become tags, the bodies become paragraphs, and the lists
  // and links render themselves. The heading is drawn once and skipped here.
  const tags = section.fields.filter(
    (f) =>
      f.key !== headingKey &&
      !f.quick_edit &&
      (f.type === "text" || f.type === "select") &&
      !isBlank(readValue(f, note)),
  );
  const bodies = section.fields.filter(
    (f) => f.type === "textarea" && !isBlank(readValue(f, note)),
  );
  const quick = section.fields.filter((f) => f.quick_edit);

  return (
    <div className="flex-1 min-w-0 space-y-1">
      {(heading || tags.length || quick.length) && (
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

// --- Section --------------------------------------------------------------

export default function StructuredSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}) {
  // `null` means the draft is a root; an id means it is a child of that row.
  // `false` means no draft is open, which is why this is not a boolean.
  const [addingUnder, setAddingUnder] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(section));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

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

  // A move swaps two SIBLINGS, and then the whole section is renumbered in
  // tree order.
  //
  // Sending just the swapped pair's siblings would be the smaller payload and
  // is refused: PATCH /api/notes/reorder takes ids naming exactly the section,
  // so a partial list is a loud 400 rather than a quiet partial renumber. That
  // is the right invariant to leave alone, and flattening depth-first is the
  // better answer anyway - `sort_index` ends up ascending in the order the
  // page actually draws, so a reader of the raw rows sees the tree's order too.
  //
  // `parent` is the node whose children are being reordered, or null for the
  // roots. The swapped array is substituted by identity while flattening,
  // which is safe because these arrays are stable for the render.
  const move = (parent, i, delta) => {
    const siblings = parent ? parent.children : tree;
    const j = i + delta;
    if (j < 0 || j >= siblings.length || !onReorder) return;

    const swapped = [...siblings];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];

    const flatten = (nodes) =>
      (nodes === siblings ? swapped : nodes).flatMap((node) => [
        node.note.system_id,
        ...flatten(node.children),
      ]);
    onReorder(section.key, flatten(tree));
  };

  const renderDraft = () => (
    <div className={draftCls}>
      <StructuredForm section={section} val={draft} setVal={setDraft} />
      <SaveCancel onSave={commit} onCancel={closeDraft} />
    </div>
  );

  const renderNodes = (siblings, depth, parent = null) =>
    siblings.map((node, i) => {
      const n = node.note;
      const editing = editId === n.system_id;
      return (
        <div key={n.system_id} className={depth === 0 ? rowCls : "pt-2"}>
          {editing ? (
            <div>
              <StructuredForm
                section={section}
                val={editVal}
                setVal={setEditVal}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              {isAdmin && onReorder && siblings.length > 1 && (
                <MoveButtons
                  atTop={i === 0}
                  atBottom={i === siblings.length - 1}
                  onUp={() => move(parent, i, -1)}
                  onDown={() => move(parent, i, 1)}
                />
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
        </div>
      );
    });

  return (
    <SectionCard
      label={section.label}
      count={notes.length}
      isAdmin={isAdmin}
      onAdd={() => {
        setDraft(emptyDraft(section));
        setAddingUnder(null);
      }}
    >
      {renderNodes(tree, 0)}
      {addingUnder === null && renderDraft()}
      {!notes.length && addingUnder === false && <EmptyHint />}
    </SectionCard>
  );
}
