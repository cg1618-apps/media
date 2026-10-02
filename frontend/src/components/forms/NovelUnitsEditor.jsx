// Frontend: form component for a novel's units (volumes, arcs, stories).
import { kindsForType, unitDisplayKey } from "../../lib/novelUnits";
import { MY_RATINGS } from "../../config/fieldOptions";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../ui/Sortable";

const baseCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
const keyInputCls = baseCls + " w-24 shrink-0";
const nameInputCls = baseCls + " flex-1 min-w-0";
const numInputCls = baseCls + " w-24 shrink-0";
const kindSelectCls = baseCls + " w-28 shrink-0";
const ratingSelectCls = baseCls + " w-20 shrink-0";

export default function NovelUnitsEditor({ items, novelType, onChange }) {
  const kinds = kindsForType(novelType);
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
        remark: "",
        ch_count: "",
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
          <SortableItem key={rowIds[i]} id={rowIds[i]} className="flex gap-1.5 items-center">
            <DragHandle
              label={unitDisplayKey(entry.unit_kind, entry.position, entry.unit_key)}
            />

            {/* A row can be stranded when the novel's Type changes and the
                stored unit_kind is no longer offered (e.g. Web -> Other
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
            <input
              className={nameInputCls}
              placeholder="Remark"
              value={entry.remark || ""}
              onChange={(e) => updateEntry(i, "remark", e.target.value)}
            />
            {/* Each unit is rated on its own, on the same S..F scale as the
                novel's my_rating. Every kind gets one - a volume is the usual
                case, but an arc is just as ratable. Nothing derives from it. */}
            <select
              className={ratingSelectCls}
              value={entry.my_rating || ""}
              onChange={(e) =>
                updateEntry(i, "my_rating", e.target.value || undefined)
              }
              aria-label={`Rating for ${unitDisplayKey(
                entry.unit_kind,
                entry.position,
                entry.unit_key,
              )}`}
            >
              <option value="">—</option>
              {MY_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

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
