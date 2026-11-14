// Frontend: tracker component file for MyTrackerCard.
//
// A slip: mono title on a dotted rule, the episode stepper as outline
// buttons around a mono input, selects on hairlines. Status is text, never
// a coloured background.
//
// Every value here is the viewer's own - status, rating, progress, the
// paused-at position, the plan flags - kept per account under self.list.
// `canTrack` is that permission (useViewScope().ownData). Without it the
// card, the stepper and the paused-at field are not drawn at all: there is no
// row of the viewer's to show and nothing it could save. The page writes each
// change through /api/me (useOwnTrackerSave), never the catalogue PATCH.
import { useId } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button, Chip, Eyebrow, Slip } from "../ui/primitives";
import StatusOptions from "../ui/StatusOptions";

export const SELECT_CLS =
  "block w-full bg-surface border border-border-strong text-text text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";

export const STEP_INPUT_CLS =
  "font-mono text-text text-sm w-12 text-right bg-surface border border-border-strong px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand appearance-none disabled:opacity-60";

/**
 * The episode stepper: − / input / + around `epFin` of `epTotal`, clamped to
 * the total. Exported for a tracker that lays out its own fields (hentai's)
 * but steps episodes exactly as this card does. Not drawn without `canTrack`.
 */
export function EpisodeStepper({
  epFin,
  epTotal,
  canTrack,
  onEpChange,
  hasCum,
  cumFin,
  cumTotal,
}) {
  if (!canTrack) return null;

  function stepEp(delta) {
    const cur = epFin || 0;
    const total =
      epTotal != null && epTotal !== "?" ? parseInt(epTotal, 10) : null;
    let next = cur + delta;
    if (total !== null && next > total) next = total;
    if (next < 0) next = 0;
    if (next === cur) return;
    onEpChange(next);
  }

  function handleInputChange(e) {
    const v = parseInt(e.target.value, 10) || 0;
    if (epTotal !== "?" && epTotal != null && v > parseInt(epTotal)) return;
    onEpChange(Math.max(0, v));
  }

  return (
    <div className="flex items-center gap-1.5">
      {hasCum && (
        <Chip tone="muted" title="Cumulative episodes" className="mr-1">
          Cum {cumFin}/{cumTotal}
        </Chip>
      )}
      <Button
        size="sm"
        onClick={() => stepEp(-1)}
        aria-label="Previous episode"
        className="font-mono w-7 px-0"
      >
        −
      </Button>
      <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
        <input
          type="number"
          value={epFin}
          onChange={handleInputChange}
          className={STEP_INPUT_CLS}
          aria-label="Episodes finished"
        />
        <span className="text-text-faint text-xs">/</span>
        <span className="text-text-muted">{epTotal}</span>
      </div>
      <Button
        size="sm"
        onClick={() => stepEp(1)}
        aria-label="Next episode"
        className="font-mono w-7 px-0"
      >
        +
      </Button>
    </div>
  );
}

/**
 * "Paused at": where playback stopped, as free text - "1:10:00" into a movie,
 * "14:35" into the next episode. Exported for the trackers that lay out their
 * own fields (movie, anime movie, hentai). Not drawn without `canTrack`.
 *
 * Saved on blur or Enter, and only when the trimmed text differs from what
 * is stored, so tabbing through the tracker writes nothing. A blank saves as
 * null. The server clears the position when ep_fin goes up or the entry
 * becomes Completed; the input is keyed on the stored value so that a cleared
 * position shows the moment the write's response lands.
 */
export function PausedAtInput({
  value,
  canTrack,
  onChange,
  placeholder = "14:35",
  className = "space-y-1.5",
}) {
  const id = useId();
  if (!canTrack) return null;
  const stored = value ?? "";

  function commit(e) {
    const next = e.target.value.trim();
    if (next === stored) return;
    onChange(next || null);
  }

  return (
    <div className={className}>
      <Eyebrow as="label" htmlFor={id} className="block">
        Paused at
      </Eyebrow>
      <input
        key={stored}
        id={id}
        type="text"
        defaultValue={stored}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={placeholder}
        className={SELECT_CLS}
      />
    </div>
  );
}

/** One plan flag as a checkbox - Watch next, To rewatch, and each type's spelling. */
function PlanFlagToggle({ label, checked, onChange }) {
  return (
    <div className="space-y-1.5">
      <Eyebrow className="block">{label}</Eyebrow>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-brand"
        />
        <span className="text-sm text-text-muted">{label}</span>
      </label>
    </div>
  );
}

export default function MyTrackerCard({
  epFin,
  epTotal,
  hasCum,
  cumFin,
  cumTotal,
  watchingStatus,
  myRating,
  timeFin,
  watchNext,
  toRewatch,
  canTrack,
  onEpChange,
  onStatusChange,
  onRatingChange,
  onTimeFinChange,
  onWatchNextChange,
  onToRewatchChange,
  statusOptions,
  ratingOptions,
  statusLabel = "Watching status",
  rewatchLabel = "To rewatch",
  pausedPlaceholder,
}) {
  const statusId = useId();
  const ratingId = useId();
  // The card is titled "My tracker" and every field in it is one person's
  // own, so a guest - and a signed-in viewer without self.list - has no "my"
  // here and the card does not belong on the page at all. Guarded here rather
  // than at each detail page, so another media type cannot forget it.
  const { username } = useAuth();
  if (!username || !canTrack) return null;

  // Not every media type counts something off. A game has no episode, issue
  // or chapter unit, so it passes no onEpChange and the card renders without
  // a stepper rather than showing an inert 0 / undefined counter.
  const stepper =
    typeof onEpChange === "function" ? (
      <EpisodeStepper
        epFin={epFin}
        epTotal={epTotal}
        canTrack={canTrack}
        onEpChange={onEpChange}
        hasCum={hasCum}
        cumFin={cumFin}
        cumTotal={cumTotal}
      />
    ) : null;

  return (
    <Slip title="My tracker" actions={stepper}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status */}
        <div className="space-y-1.5">
          <Eyebrow as="label" htmlFor={statusId} className="block">
            {statusLabel}
          </Eyebrow>
          <select
            id={statusId}
            value={watchingStatus || ""}
            onChange={(e) => onStatusChange(e.target.value)}
            className={SELECT_CLS}
          >
            <StatusOptions statuses={statusOptions} />
          </select>
        </div>
        {/* Rating */}
        <div className="space-y-1.5">
          <Eyebrow as="label" htmlFor={ratingId} className="block">
            Rating
          </Eyebrow>
          <select
            id={ratingId}
            value={myRating || ""}
            onChange={(e) => onRatingChange(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Unrated</option>
            {ratingOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {/* Only the watching types pass a handler: a paused position means
            nothing for a comic or a game. */}
        {typeof onTimeFinChange === "function" && (
          <PausedAtInput
            value={timeFin}
            canTrack={canTrack}
            onChange={onTimeFinChange}
            placeholder={pausedPlaceholder}
          />
        )}
        {onWatchNextChange !== undefined && (
          <PlanFlagToggle
            label="Watch next"
            checked={watchNext}
            onChange={onWatchNextChange}
          />
        )}
        {onToRewatchChange !== undefined && (
          <PlanFlagToggle
            label={rewatchLabel}
            checked={toRewatch}
            onChange={onToRewatchChange}
          />
        )}
      </div>
    </Slip>
  );
}
