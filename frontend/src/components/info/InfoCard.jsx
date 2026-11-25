// Frontend: info component file for InfoCard.
//
// An index card: a mono eyebrow title on a rule, then label/value pairs
// set like fields on a catalogue slip. Flat - no header tint, no shadow.
//
// `fields` is a list of rows: an array of fields shares a line, a lone field
// takes a full line. Every row shares one column grid, as wide as the card's
// widest row, and fills it from the left - so a field sits under the field
// in the same column above it, rather than each row dividing the width among
// its own fields.
export function InfoRow({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] text-text-faint mb-1">
        {label}
      </div>
      <div className="text-sm text-text break-words">
        {value != null && value !== "" ? value : <span className="text-text-faint">—</span>}
      </div>
    </div>
  );
}

export default function InfoCard({ title, fields }) {
  const columns = Math.max(
    1,
    ...fields.filter(Array.isArray).map((row) => row.length),
  );
  return (
    <section className="bg-surface border border-border">
      <h3 className="flex items-center gap-3 px-4 py-2.5 border-b border-border font-mono text-[11px] text-text-muted">
        {title}
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
      </h3>
      <div className="p-4 space-y-4">
        {fields.map((row, i) =>
          Array.isArray(row) ? (
            <div
              key={i}
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {row.map(({ label, value }) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </div>
          ) : (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ),
        )}
      </div>
    </section>
  );
}
