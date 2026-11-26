// Frontend: the marks section at the top of the Add and Modify pages - an
// entry's flags (EntryFlags), its 待補充 mark and its content labels, in one
// card styled like the editor card.
//
// On Modify it sits under the Back bar, above the "Other entries in this
// franchise" ribbon; on Add it sits above the tab's own card. Each page
// decides which pieces its tab shows and passes them as children; a tab with
// none of the three passes none and draws no section.
import { Children } from "react";

export default function FormMarksSection({ children }) {
  if (!Children.toArray(children).length) return null;
  return (
    <section
      aria-label="Marks"
      data-testid="form-marks-section"
      className="mb-6 bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-3"
    >
      {children}
    </section>
  );
}
