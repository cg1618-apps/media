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
import { Chip, eyebrowCls } from "../ui/primitives";

export default function ContentLabelChips({
  labels,
  // What a group's chips say they cover - a collection, franchise or
  // series hides everything under it. The default reads for an entry.
  note,
  // The eyebrow before the chips. A page that sets the chips under a label
  // of its own (the person page's Profile card) passes null.
  heading = "Content",
  className = "",
}) {
  if (!labels?.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {heading && <span className={eyebrowCls}>{heading}</span>}
      {labels.map((row) => (
        <Chip key={row.key} tone="danger" title={row.description || note || ""}>
          {row.label}
        </Chip>
      ))}
    </div>
  );
}
