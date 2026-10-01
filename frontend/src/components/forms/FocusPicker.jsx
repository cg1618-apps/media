// Frontend: the modal that sets an image's focal point.
//
// Images are drawn cropped (object-cover) almost everywhere, and a crop keeps
// the centre unless it is told otherwise. This shows the WHOLE image with a
// marker on the point that should stay in frame; a click or a drag on the
// image moves it, and the arrow keys nudge it by 1% (10% with Shift) while the
// marker has focus. Beside it, the image is previewed in the two frames it is
// most often cropped to - a 2:3 portrait card and a square - so the effect is
// visible before it is saved.
//
// The value is the string the API stores and CSS reads as object-position,
// "X% Y%" (lib/covers.js parseFocus / formatFocus). The centre is null: Done
// on a centred marker, or Reset to centre, hands back null.
import { useEffect, useRef, useState } from "react";

import { focusStyle, formatFocus, parseFocus } from "../../lib/covers";
import { Button } from "../ui/primitives";

const NUDGE = 1;
const NUDGE_SHIFT = 10;

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function clamp(n) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export default function FocusPicker({ src, focus, onDone, onCancel }) {
  const [point, setPoint] = useState(() => parseFocus(focus));
  const frameRef = useRef(null);
  const dragging = useRef(false);
  const current = formatFocus(point);

  // Escape cancels, as the backdrop does.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function pointFromEvent(e) {
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  }

  function handlePointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const next = pointFromEvent(e);
    if (!next) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPoint(next);
  }

  function handlePointerMove(e) {
    if (!dragging.current) return;
    const next = pointFromEvent(e);
    if (next) setPoint(next);
  }

  function endDrag() {
    dragging.current = false;
  }

  function handleMarkerKey(e) {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
    setPoint((p) => ({
      x: clamp(p.x + dir[0] * step),
      y: clamp(p.y + dir[1] * step),
    }));
  }

  // stopPropagation-free backdrop dismiss, matching ImagePicker's
  // LibraryModal: only a press that both starts and ends on the backdrop
  // itself closes the modal, so a drag that overshoots the image does not.
  const pressedBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-picker-title"
        className="m-4 w-full max-w-3xl overflow-hidden border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <h3
            id="focus-picker-title"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            Adjust position
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="px-1.5 py-1 text-text-faint hover:text-text"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6 sm:flex-row">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              ref={frameRef}
              data-testid="focus-frame"
              className="relative inline-block cursor-crosshair touch-none select-none border border-border bg-surface-2"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                loading="lazy"
                src={src}
                alt="Whole image"
                draggable={false}
                className="block max-h-[60vh] max-w-full"
              />
              <button
                type="button"
                aria-label={`Focal point, ${point.x}% across, ${point.y}% down`}
                title="Arrow keys move it by 1%, Shift + arrow by 10%"
                onKeyDown={handleMarkerKey}
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-brand bg-brand/40 ring-2 ring-brand focus-visible:outline-none focus-visible:ring-4"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              Click or drag on the image to choose what stays in frame.
            </p>
          </div>

          <div className="flex shrink-0 flex-row gap-4 sm:flex-col">
            <figure className="space-y-1">
              <div className="aspect-[2/3] w-24 overflow-hidden border border-border bg-surface-2">
                <img
                  loading="lazy"
                  src={src}
                  alt="Portrait preview"
                  className="h-full w-full object-cover"
                  style={focusStyle(current)}
                />
              </div>
              <figcaption className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Card
              </figcaption>
            </figure>
            <figure className="space-y-1">
              <div className="aspect-square w-24 overflow-hidden border border-border bg-surface-2">
                <img
                  loading="lazy"
                  src={src}
                  alt="Square preview"
                  className="h-full w-full object-cover"
                  style={focusStyle(current)}
                />
              </div>
              <figcaption className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Square
              </figcaption>
            </figure>
            <p
              className="font-mono text-[11px] tabular-nums text-text-muted"
              aria-live="polite"
            >
              {point.x}% {point.y}%
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            onClick={() => setPoint(parseFocus(null))}
          >
            Reset to centre
          </Button>
          <div className="flex gap-2">
            <Button type="button" kind="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              kind="primary"
              size="sm"
              onClick={() => onDone(current)}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
