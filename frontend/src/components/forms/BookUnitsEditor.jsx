// Frontend: form component for a book's units (volumes, arcs, stories).
//
// The catalogue half only. A unit's rating and remark are each reader's own,
// written through PUT /api/me/book-units/{unit_id} from the book's detail
// page, so this editor has no control for either and its rows carry neither.
//
// Each row has a second line: the unit's JP and TW release dates, on every
// kind, and its cover. The cover is attached through the image library the
// moment it is picked (ImagePicker with ownerType "book-unit"), so it needs a
// saved unit to attach to - a row added since the last save shows a note in
// its place - and the units save never sends it (lib/payloads.js).
import { kindsForType, unitDisplayKey } from "../../lib/bookUnits";
import { isValidReleaseDate } from "../../lib/releaseDate";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../ui/Sortable";
import ImagePicker from "./ImagePicker";

const baseCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
const keyInputCls = baseCls + " w-24 shrink-0";
const nameInputCls = baseCls + " flex-1 min-w-0";
const numInputCls = baseCls + " w-24 shrink-0";
const kindSelectCls = baseCls + " w-28 shrink-0";
const dateInputCls = baseCls + " w-32 shrink-0 font-mono";
const invalidCls = " border-danger focus:ring-danger";

// One release-date cell. Free text for the partial precisions, marked when
// it is not one of them; the server refuses it the same way.
function UnitDateInput({ label, value, onChange }) {
  const invalid = !isValidReleaseDate(value);
  return (
    <input
      className={dateInputCls + (invalid ? invalidCls : "")}
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? "Use YYYY, YYYY-MM, or YYYY-MM-DD." : undefined}
      placeholder={label.startsWith("JP") ? "JP date" : "TW date"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function BookUnitsEditor({ items, bookType, onChange }) {
  const kinds = kindsForType(bookType);
  const rows = items || [];

  const addEntry = () =>
    onChange([
      ...rows,
      {
        unit_kind: kinds[0],
        position: rows.length + 1,
        unit_key: "",
        name_cn: "",
        name_en: "",
        ch_count: "",
        release_date_jp: "",
        release_date_tw: "",
      },
    ]);

  const removeEntry = (i) =>
    onChange(rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j + 1 })));

  const updateEntry = (i, field, value) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  // ch_count is meaningful only on arc rows; clear it in the same update as
  // unit_kind so a value the UI has already hidden can't ride along in the
  // payload after the user picks a non-arc kind.
  const updateKind = (i, kind) =>
    onChange(
      rows.map((x, j) =>
        j === i
          ? { ...x, unit_kind: kind, ...(kind === "arc" ? {} : { ch_count: "" }) }
          : x,
      ),
    );

  // Drag a row by its handle, then renumber. position is not unique in the
  // database precisely so a move cannot trip a constraint mid-save. A unit
  // not saved yet has no system_id, so it is identified by its index.
  const rowIds = rows.map((r, i) => r.system_id || `new-${i}`);
  const move = (from, to) =>
    onChange(arrayMove(rows, from, to).map((r, k) => ({ ...r, position: k + 1 })));

  return (
    <div className="space-y-2">
      <SortableList ids={rowIds} onMove={move}>
        {rows.map((entry, i) => (
          <SortableItem key={rowIds[i]} id={rowIds[i]} className="flex gap-1.5 items-start">
            <DragHandle
              label={unitDisplayKey(entry.unit_kind, entry.position, entry.unit_key)}
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex gap-1.5 items-center">
                {/* A row can be stranded when the book's Type changes and the
                    stored unit_kind is no longer offered (e.g. 網路小說 -> 其他
                    leaves an "arc" row around). The server re-normalises on
                    write and the row stays valid, but the select must still be
                    reachable so the user can see and fix the mismatch — so it
                    renders (with a disabled, annotated option for the stranded
                    kind) even when the type would otherwise offer only one kind. */}
                {kinds.length > 1 || !kinds.includes(entry.unit_kind) ? (
                  <select
                    className={kindSelectCls}
                    value={entry.unit_kind}
                    onChange={(e) => updateKind(i, e.target.value)}
                    aria-label={`Kind for ${unitDisplayKey(
                      entry.unit_kind,
                      entry.position,
                      entry.unit_key,
                    )}`}
                  >
                    {!kinds.includes(entry.unit_kind) ? (
                      <option value={entry.unit_kind} disabled>
                        {entry.unit_kind} (not valid for this type)
                      </option>
                    ) : null}
                    {kinds.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                ) : null}

                <input
                  className={keyInputCls}
                  placeholder={unitDisplayKey(entry.unit_kind, entry.position, null)}
                  value={entry.unit_key || ""}
                  onChange={(e) => updateEntry(i, "unit_key", e.target.value)}
                />
                <input
                  className={nameInputCls}
                  placeholder="CN name"
                  value={entry.name_cn || ""}
                  onChange={(e) => updateEntry(i, "name_cn", e.target.value)}
                />
                <input
                  className={nameInputCls}
                  placeholder="EN name"
                  value={entry.name_en || ""}
                  onChange={(e) => updateEntry(i, "name_en", e.target.value)}
                />
                {entry.unit_kind === "arc" ? (
                  <input
                    className={numInputCls}
                    type="number"
                    step="any"
                    placeholder="chapters"
                    value={entry.ch_count ?? ""}
                    onChange={(e) => updateEntry(i, "ch_count", e.target.value)}
                  />
                ) : null}

                <button
                  type="button"
                  className="text-danger/70 hover:text-danger px-1 shrink-0"
                  aria-label="Remove"
                  onClick={() => removeEntry(i)}
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                <UnitDateInput
                  label={`JP release for ${unitDisplayKey(entry.unit_kind, entry.position, entry.unit_key)}`}
                  value={entry.release_date_jp}
                  onChange={(v) => updateEntry(i, "release_date_jp", v)}
                />
                <UnitDateInput
                  label={`TW release for ${unitDisplayKey(entry.unit_kind, entry.position, entry.unit_key)}`}
                  value={entry.release_date_tw}
                  onChange={(v) => updateEntry(i, "release_date_tw", v)}
                />
                {entry.system_id ? (
                  <div role="group" aria-label="Cover" className="shrink-0">
                    <ImagePicker
                      compact
                      ownerType="book-unit"
                      ownerId={entry.system_id}
                      value={entry.cover_image_file || ""}
                      onChange={(key) => updateEntry(i, "cover_image_file", key || null)}
                    />
                  </div>
                ) : (
                  <span className="font-mono text-[11px] text-text-faint">
                    Cover after saving
                  </span>
                )}
              </div>
            </div>
          </SortableItem>
        ))}
      </SortableList>
      <button
        type="button"
        className="text-xs text-brand hover:underline mt-1"
        onClick={addEntry}
      >
        + Add {kinds.length > 1 ? "unit" : kinds[0]}
      </button>
    </div>
  );
}
