// Frontend: the random picker's Weights tab - every weight the weighted draw
// uses, rendered from the tables in lib/pickerWeights.js themselves, so this
// page cannot say something the draw does not do.
import { Eyebrow } from "../ui/primitives";
import {
  COMPLETED_STATUS_WEIGHTS,
  DECADE_WEIGHTS,
  GROUP_OVERRIDES,
  GROUP_WEIGHTS,
  PLAN_WEIGHTS,
  RATING_TIERS,
  SERIALIZATION_WEIGHTS,
} from "../../lib/pickerWeights";
import { pickerTypeLabel } from "../../lib/randomPicker";

function WeightTable({ title, note, rows }) {
  return (
    <section className="space-y-2">
      <Eyebrow>{title}</Eyebrow>
      {note && <p className="text-sm text-text-muted">{note}</p>}
      <table className="w-full max-w-md text-sm">
        <tbody>
          {rows.map(([label, weight]) => (
            <tr key={label} className="border-b border-border">
              <td className="py-1.5 pr-4 text-text">{label}</td>
              <td className="py-1.5 text-right font-mono text-text-muted">{weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function PickerWeights() {
  const overrides = Object.entries(GROUP_OVERRIDES)
    .map(([status, group]) => `${status} counts as ${group}`)
    .join("; ");

  return (
    <div className="space-y-8 max-w-3xl">
      <p className="text-sm text-text-muted">
        A weighted pick happens in two steps. First a status group is chosen, by the group weights
        below, among the groups the filtered pool holds, so a large group gets no bigger share for
        being large. Then one entry in that group is chosen, by its entry weights multiplied
        together. Every weight is relative: 1.5 is half again as likely as 1. Turn weighting off on
        the Pick tab to give every entry the same chance.
      </p>

      <WeightTable
        title="Step 1 · Status group"
        note={`Grouped as the Status filter groups them, except: ${overrides}. An unset status counts as Might.`}
        rows={GROUP_WEIGHTS.map((g) => [g.group, g.weight])}
      />

      <div className="space-y-6">
        <p className="text-sm text-text-muted">
          Step 2 · Entry weights, multiplied. Each applies inside the group chosen in step 1, so
          none of them can lift an entry into another group&apos;s share.
        </p>

        <WeightTable
          title="My rating · Completed only"
          rows={RATING_TIERS.map((t) => [t.ratings.join(", "), t.weight])}
        />
        <WeightTable
          title="Completion · Completed only"
          rows={COMPLETED_STATUS_WEIGHTS.map((s) => [s.status, s.weight])}
        />
        <WeightTable
          title="Plan mark"
          note="A mark counts whether it is on the entry, its series or its franchise. An entry with both takes the larger. Plan marks are your own, so a signed-out pick has none."
          rows={PLAN_WEIGHTS.map((p) => [p.mark, p.weight])}
        />
        <WeightTable
          title="Release decade"
          rows={DECADE_WEIGHTS.map((d) => [d.decades, d.weight])}
        />
        {Object.entries(SERIALIZATION_WEIGHTS).map(([type, weights]) => (
          <WeightTable
            key={type}
            title={`Serialization · ${pickerTypeLabel(type)} mode only`}
            note="A status not listed here, or none, weighs 1."
            rows={Object.entries(weights).sort((a, b) => b[1] - a[1])}
          />
        ))}
      </div>
    </div>
  );
}
