// Frontend: the typed half of a progress stepper - episodes, chapters,
// issues, volumes, a page, an arc.
//
// Typing edits a draft; nothing is saved per keystroke. The draft is
// committed on blur (clicking or tapping elsewhere) or on Enter, which is
// also what a phone keyboard's Done / Go key sends, and Escape throws it away
// and shows the saved value again. `onCommit` is called at most once per
// edit, with the parsed number, and not at all when it equals `value`.
//
// What a typed number means stays the caller's: an empty box parses to 0,
// as it always has, and `onCommit` is the same handler the stepper's own
// clamping lives in - over the total is refused there, a negative is raised
// to 0 there. A refused commit leaves nothing to undo here, because the draft
// is dropped either way and the box shows `value` again.
//
// The − / + buttons beside it are not this component's business: they keep
// calling their handler directly and save at once.
import { useRef, useState } from "react";

export default function ProgressInput({
  value,
  onCommit,
  decimal = false,
  onBlur,
  onKeyDown,
  ...rest
}) {
  // The draft is read in the same event that changes it (Escape, then the
  // blur it causes), so it lives in a ref as well as in state.
  const [draft, setDraftState] = useState(null);
  const draftRef = useRef(null);
  const setDraft = (next) => {
    draftRef.current = next;
    setDraftState(next);
  };

  function commit() {
    const text = draftRef.current;
    if (text === null) return;
    setDraft(null);
    const parsed = decimal ? parseFloat(text) : parseInt(text, 10);
    const next = Number.isFinite(parsed) ? parsed : 0;
    if (next === Number(value ?? 0)) return;
    onCommit(next);
  }

  return (
    <input
      type="number"
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="done"
      value={draft ?? value ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
      {...rest}
    />
  );
}
