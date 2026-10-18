// Frontend: Enter in a field where typing and then Enter is how a value goes
// in - a tag pill, a note's name, a search that runs only on demand - read
// the same way from a desktop keyboard and from a phone's.
//
// A phone breaks a plain `e.key === "Enter"` check two ways:
//   - an Android keyboard (Gboard, Samsung) can report its action key as
//     key "Unidentified" / keyCode 229, so the keydown never reads as Enter.
//     The browser still runs the form's implicit submission, and the
//     page-wide Add or Modify form saves the whole entry instead.
//   - Enter that confirms an IME composition (a CJK candidate) arrives with
//     isComposing set; it finishes the word, it is not a request to add.
//
// isEnterKey answers both for a keydown. useEnterSubmitGuard catches what a
// keydown missed: it listens for the surrounding form's submit and, while
// the field has focus and `onEnter()` reports that it took the text, cancels
// the submit before React's onSubmit sees it. A desktop Enter is already
// handled - and its default prevented - on keydown, so no submit happens and
// the guard stays idle; an empty field returns false and lets the form
// submit as it always has.
//
// Neither is a guarantee on every keyboard, which is why each such field
// also offers a tappable row for the same action.
import { useEffect, useRef } from "react";

/** True for a keydown that is Enter, and not one confirming a composition. */
export function isEnterKey(e) {
  const native = e.nativeEvent ?? e;
  if (native.isComposing || e.keyCode === 229) return false;
  return e.key === "Enter" || e.keyCode === 13;
}

/**
 * While `inputRef.current` has focus, a submit of its form calls `onEnter()`;
 * when that returns true the submit is cancelled and stops at the form.
 */
export function useEnterSubmitGuard(inputRef, onEnter) {
  const latest = useRef(onEnter);
  useEffect(() => {
    latest.current = onEnter;
  });

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    function onSubmit(e) {
      if (document.activeElement !== inputRef.current) return;
      if (!latest.current?.()) return;
      e.preventDefault();
      // React listens at the root, so stopping here keeps the page's own
      // onSubmit from saving the entry.
      e.stopImmediatePropagation();
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [inputRef]);
}
