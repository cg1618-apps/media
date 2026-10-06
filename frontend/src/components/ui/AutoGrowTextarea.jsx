// A textarea that grows with what is typed into it, for the short free-text
// fields of a note - a description, a remark, a quote. It opens `rows` high (2
// by default) so a one-line note stays compact, fits its height to the text on
// every change, and stops at `max-h-80` (about fourteen lines), after which it
// scrolls inside rather than pushing the rest of the page down.
//
// Height is set from scrollHeight rather than CSS `field-sizing: content`,
// which Firefox does not support. Manual resize is off: the next keystroke would
// undo a drag anyway.
import { useLayoutEffect, useRef } from "react";

export default function AutoGrowTextarea({ value, rows = 2, className = "", ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first, or scrollHeight never reports less than the current
    // height and the box could only grow.
    el.style.height = "auto";
    const style = window.getComputedStyle(el);
    const borders =
      (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    el.style.height = `${el.scrollHeight + borders}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={rows}
      className={`${className} resize-none max-h-80 overflow-y-auto`}
      {...props}
    />
  );
}
