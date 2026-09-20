// Frontend: show which content labels restrict the thing on screen.
//
// Read-only. The labels are CHANGED on the Add/Modify forms
// (components/forms/ContentLabelPicker.jsx); this is the display half, and
// the two are separate because a detail page is not an edit surface.
//
// Renders nothing when there are none, which is the overwhelmingly common
// case - an unlabelled entry must not grow an empty heading.
//
// Everything reaching this component is already something the viewer may see:
// the API refuses an entry whose labels their active mode does not carry
// (app/services/rbac/enforcement.py), so a label shown here is one this
// session holds, never a hint about one it does not.
import { Chip } from "../ui/primitives";

export default function ContentLabelChips({
  labels,
  // What a franchise's chips say they cover. The default reads for an entry.
  note,
  className = "",
}) {
  if (!labels?.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        Content
      </span>
      {labels.map((row) => (
        <Chip key={row.key} tone="danger" title={row.description || note || ""}>
          {row.label}
        </Chip>
      ))}
    </div>
  );
}
