// Frontend: tracker component file for NovelTrackerBlock.
import { useAuth } from "../../contexts/AuthContext";
import { Button, Eyebrow, Slip } from "../ui/primitives";
import { SELECT_CLS, STEP_INPUT_CLS } from "./MyTrackerCard";
import StatusOptions from "../ui/StatusOptions";
import ProgressInput from "./ProgressInput";
import {
  READING_STATUSES,
  withLegacyProgressDisplay,
} from "../../config/fieldOptions";
import {
  arcCursorForChapters,
  arcCursorFromView,
  arcProgressView,
  arcStep,
  countsChapters,
  countsVolumes,
  effectiveProgressDisplay,
  progressDisplayOptions,
  unitDisplayKey,
  wholeArcStep,
} from "../../lib/novelUnits";

// A typed number: an empty or unparseable box reads as 0, as the volume and
// chapter boxes always have.
const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function stepUp(v) {
  return Math.floor(v) + 1;
}
function stepDown(v) {
  return Math.ceil(v) - 1;
}

const UNIT_CLS =
  "font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint ml-1.5";

function StepButton({ onClick, label, children }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      aria-label={label}
      className="font-mono w-7 px-0"
    >
      {children}
    </Button>
  );
}

// The row for the progress mode in use gets the brand rule on its left;
// the others sit on a hairline.
function TrackerRow({ isHighlighted, label, children }) {
  return (
    <div
      className={`pl-3 pr-2 py-2.5 border-l-2 transition-colors ${
        isHighlighted ? "border-brand bg-brand-soft" : "border-border"
      }`}
    >
      <Eyebrow className="mb-2">{label}</Eyebrow>
      {children}
    </div>
  );
}

export default function NovelTrackerBlock({
  novel,
  canTrack,
  onChChange,
  onVolChange,
  onArcProgressChange,
  onStatusChange,
  onRatingChange,
  onReadNextChange,
  onToRerereadChange,
  onProgressDisplayChange,
}) {
  // A guest has no tracker, and neither has a viewer without self.list. The
  // card is titled "My tracker" and every field in it is one person's -
  // status, rating, progress - so without a list of the viewer's there is no
  // "my" and the card does not belong on the page at all. Guarded
  // here rather than at each of the nine detail pages, so a tenth media type
  // cannot forget it.
  // Every field is the viewer's own (self.list), written through /api/me by
  // the page; without self.list there is nothing of the viewer's to show.
  const { username } = useAuth();
  if (!username || !canTrack) return null;

  const pd = effectiveProgressDisplay(novel);
  const volHighlighted = pd === "vol_original" || pd === "vol_tw";
  const chHighlighted = pd === "ch" || pd === "arc" || pd === "arc_ch";

  const volFin = novel.vol_fin ?? 0;
  const volTotalTw = novel.vol_total_tw ?? null;
  const volTotalOrig = novel.vol_total_original ?? null;
  const chFin = novel.ch_fin ?? 0;
  const chTotal = novel.ch_total ?? null;

  const primaryIsTw = pd === "vol_tw";
  const primaryVolTotal = primaryIsTw ? volTotalTw : volTotalOrig;

  // Which chapter-side row renders is the chosen display, not just whether
  // arc rows exist: "arc_ch" is the two-stage stepper, "arc" the whole-arc
  // one, "ch" the flat pair. With arc rows present ch_fin is derived from
  // them, so every edit here - stepped or typed, in any of the three rows -
  // moves the arc cursor (arc_fin, ch_fin_in_arc) rather than ch_fin, which
  // derive_novel_progress would overwrite on the same save.
  const arcs = (novel.units || [])
    .filter((u) => u.unit_kind === "arc")
    .sort((a, b) => a.position - b.position);
  const arcFin = novel.arc_fin ?? 0;
  const chInArc = novel.ch_fin_in_arc ?? 0;
  // What the rows show: the arc being read, not the arcs finished.
  const view = arcProgressView(arcs, arcFin, chInArc);
  const chIsDerived = arcs.length > 0;

  function handleVolStep(dir) {
    const next = dir > 0 ? stepUp(volFin) : stepDown(volFin);
    const bounded = primaryVolTotal !== null ? Math.min(next, primaryVolTotal) : next;
    if (bounded < 0 || bounded === volFin) return;
    onVolChange(bounded);
  }

  function handleWholeArcStep(dir) {
    const next = wholeArcStep(arcs, arcFin, chInArc, dir);
    if (next.arc_fin === arcFin && next.ch_fin_in_arc === chInArc) return;
    onArcProgressChange(next);
  }

  function handleArcChapterStep(dir) {
    const next = arcStep(arcs, novel.arc_fin ?? 0, chInArc, dir);
    if (next.arc_fin === (novel.arc_fin ?? 0) && next.ch_fin_in_arc === chInArc) {
      return;
    }
    onArcProgressChange(next);
  }

  // A typed arc or chapter, as the rows show them, back to the stored cursor.
  function handleArcCursorInput(next) {
    if (next.arc_fin === arcFin && next.ch_fin_in_arc === chInArc) return;
    onArcProgressChange(next);
  }

  function handleChStep(dir) {
    const next = dir > 0 ? stepUp(chFin) : stepDown(chFin);
    const bounded = chTotal !== null ? Math.min(next, chTotal) : next;
    if (bounded < 0 || bounded === chFin) return;
    onChChange(bounded);
  }

  return (
    <Slip title="My tracker">
      <div className="space-y-4">
        {/* Status, Rating & Progress Display */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Reading status
            </Eyebrow>
            <select
              value={novel.reading_status || ""}
              onChange={(e) => onStatusChange(e.target.value)}
              className={SELECT_CLS}
            >
              <StatusOptions statuses={READING_STATUSES} />
            </select>
          </div>
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Rating
            </Eyebrow>
            <select
              value={novel.my_rating || ""}
              onChange={(e) => onRatingChange(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Unrated</option>
              {MY_RATINGS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Progress display
            </Eyebrow>
            <select
              value={novel.progress_display || ""}
              onChange={(e) => onProgressDisplayChange(e.target.value)}
              className={SELECT_CLS}
              aria-label="Progress display"
            >
              {withLegacyProgressDisplay(
                progressDisplayOptions(novel),
                novel.progress_display,
              ).map(
                ({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ),
              )}
            </select>
          </div>
        </div>

        {/* Vol tracker. Not for Web: a web novel is read in chapters, and its
            volume columns are kept only so a later print run (or a type
            change back) is not lost — see countsVolumes(). */}
        {countsVolumes(novel) && (
        <TrackerRow isHighlighted={volHighlighted} label="Volumes">
          <div className="flex items-center gap-1.5 w-fit">
            <StepButton onClick={() => handleVolStep(-1)} label="Previous volume">−</StepButton>
            <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
              <ProgressInput
                decimal
                value={volFin}
                step="1"
                onCommit={(v) => {
                  if (primaryVolTotal !== null && v > primaryVolTotal) return;
                  onVolChange(Math.max(0, v));
                }}
                className={STEP_INPUT_CLS}
                aria-label="Volumes finished"
              />
              <span className="text-text-faint text-xs">/</span>
              {/* TW total — always first when present */}
              {volTotalTw !== null && (
                <span className={primaryIsTw ? "text-text" : "text-text-faint"}>
                  {volTotalTw}
                </span>
              )}
              {/* Separator only when both totals present */}
              {volTotalTw !== null && volTotalOrig !== null && (
                <span className="text-text-faint/60 text-xs">;</span>
              )}
              {/* Orig total — always second when present */}
              {volTotalOrig !== null && (
                <span className={!primaryIsTw ? "text-text" : "text-text-faint"}>
                  {volTotalOrig}
                </span>
              )}
              {/* Fallback when neither total is set */}
              {volTotalTw === null && volTotalOrig === null && (
                <span className="text-text-faint">?</span>
              )}
              <span className={UNIT_CLS}>vol</span>
            </div>
            <StepButton onClick={() => handleVolStep(1)} label="Next volume">+</StepButton>
          </div>
        </TrackerRow>
        )}

        {/* Chapter-side tracker. Volume-only types (Light Novel, Novel) count
            volumes and nothing else, so nothing here renders for them — the
            server clears those columns, and an empty "Chapters 0 / ?" row
            would only advertise a counter the type does not have.

            Otherwise the chosen display picks the row: "arc_ch" the two-stage
            stepper, "arc" the whole-arc one, "ch" the flat pair. */}
        {!countsChapters(novel) ? null : pd === "arc_ch" ? (
          <TrackerRow isHighlighted label="Arc / Chapter">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
                arc
                <ProgressInput
                  decimal
                  value={view.arcNumber}
                  step="1"
                  onCommit={(v) =>
                    handleArcCursorInput(arcCursorFromView(arcs, v, 0))
                  }
                  className={STEP_INPUT_CLS}
                  aria-label="Arc being read"
                />
                <span className={UNIT_CLS}>of {arcs.length}</span>
              </span>
              <span className="text-text-faint">·</span>
              <StepButton onClick={() => handleArcChapterStep(-1)} label="Previous chapter">
                  −
                </StepButton>
              <span className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
                <ProgressInput
                  decimal
                  value={view.chInArc}
                  step="1"
                  onCommit={(v) =>
                    handleArcCursorInput(
                      arcCursorFromView(arcs, view.arcNumber, v),
                    )
                  }
                  className={STEP_INPUT_CLS}
                  aria-label="Chapters read in this arc"
                />
                <span className={UNIT_CLS}>/ {view.arc?.ch_count ?? "?"} ch</span>
              </span>
              <StepButton onClick={() => handleArcChapterStep(1)} label="Next chapter">
                  +
                </StepButton>
            </div>
          </TrackerRow>
        ) : pd === "arc" ? (
          /* Whole-arc stepper: position of the arc being read, its name, and
             how many arcs there are. Stepping closes or reopens an entire arc
             and resets the in-arc cursor. */
          <TrackerRow isHighlighted label="Arcs">
            <div className="flex items-center gap-1.5 w-fit">
              <StepButton onClick={() => handleWholeArcStep(-1)} label="Previous arc">
                  −
                </StepButton>
              <span className="font-mono text-sm whitespace-nowrap flex items-center gap-1">
                arc
                <ProgressInput
                  decimal
                  value={view.arcNumber}
                  step="1"
                  onCommit={(v) =>
                    handleArcCursorInput(arcCursorFromView(arcs, v, 0))
                  }
                  className={STEP_INPUT_CLS}
                  aria-label="Arc being read"
                />
                <span className={UNIT_CLS}>/ {arcs.length}</span>
                {view.arc && (
                  <span className="text-text-muted">
                    {" · "}
                    {view.arc.name_cn ||
                      view.arc.name_en ||
                      unitDisplayKey("arc", view.arc.position, view.arc.unit_key)}
                  </span>
                )}
              </span>
              <StepButton onClick={() => handleWholeArcStep(1)} label="Next arc">
                  +
                </StepButton>
            </div>
          </TrackerRow>
        ) : chIsDerived ? (
          /* Flat pair over arc rows: ch_fin and ch_total are derived from
             the arcs, so a typed or stepped total is folded into the arc
             cursor (arcCursorForChapters / arcStep) and the server derives
             ch_fin back from it. */
          <TrackerRow isHighlighted={chHighlighted} label="Chapters">
            <div className="flex items-center gap-1.5 w-fit">
              <StepButton onClick={() => handleArcChapterStep(-1)} label="Previous chapter">−</StepButton>
              <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
                <ProgressInput
                  decimal
                  value={chFin}
                  step="1"
                  onCommit={(v) => {
                    if (chTotal !== null && v > chTotal) return;
                    handleArcCursorInput(arcCursorForChapters(arcs, v));
                  }}
                  className={STEP_INPUT_CLS}
                  aria-label="Chapters finished"
                />
                <span className="text-text-faint text-xs">/</span>
                <span className="text-text-muted">{chTotal ?? "?"}</span>
                <span className={UNIT_CLS}>ch</span>
                <span className="text-text-faint text-xs">· from arcs</span>
              </div>
              <StepButton onClick={() => handleArcChapterStep(1)} label="Next chapter">+</StepButton>
            </div>
          </TrackerRow>
        ) : (
          /* Ch tracker (flat, editable) — novels with no arc rows */
          <TrackerRow isHighlighted={chHighlighted} label="Chapters">
            <div className="flex items-center gap-1.5 w-fit">
              <StepButton onClick={() => handleChStep(-1)} label="Previous chapter">−</StepButton>
              <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
                <ProgressInput
                  decimal
                  value={chFin}
                  step="1"
                  onCommit={(v) => {
                    if (chTotal !== null && v > chTotal) return;
                    onChChange(Math.max(0, v));
                  }}
                  className={STEP_INPUT_CLS}
                  aria-label="Chapters finished"
                />
                <span className="text-text-faint text-xs">/</span>
                <span className="text-text-muted">{chTotal ?? "?"}</span>
                <span className={UNIT_CLS}>ch</span>
              </div>
              <StepButton onClick={() => handleChStep(1)} label="Next chapter">+</StepButton>
            </div>
          </TrackerRow>
        )}

        {/* Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Eyebrow className="block">Read next</Eyebrow>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!novel.read_next}
                onChange={(e) =>
                  onReadNextChange(
                    e.target.checked,
                    e.target.checked ? "Added to Read Next" : "Removed from Read Next",
                  )
                }
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">Read next</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Eyebrow className="block">To reread</Eyebrow>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!novel.to_reread}
                onChange={(e) =>
                  onToRerereadChange(
                    e.target.checked,
                    e.target.checked ? "Marked for reread" : "Removed from reread",
                  )
                }
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">To reread</span>
            </label>
          </div>
        </div>
      </div>
    </Slip>
  );
}
