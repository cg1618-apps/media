// Frontend: the four completion axes on the game detail page.
//
// These read as answers about a playthrough, not facts about the game, which
// is why they sit beside My tracker rather than in the Information card: the
// release date is true whoever is looking, and "did I see every ending" is
// not. Read-only rows there also meant the only way to change one was to open
// the Modify page for a single dropdown.
//
// Kept out of MyTrackerCard deliberately - that component serves nine media
// types and these columns exist only on games. Same shape as
// NovelTrackerBlock, which is the precedent for per-type tracker UI.
//
// The completion axes are columns on the entry, so changing one edits the
// work: an editor (`isAdmin`) gets a dropdown that writes through the
// catalogue PATCH (`onChange`), and any other signed-in viewer reads the
// value.
//
// H-Game draws the same block over its own axes (H_GAME_COMPLETION_AXES): it
// has no achievements or collectibles flag, and has All CG beside All
// Endings instead - plus usefulness, which MyTrackerCard has no place for.
// Usefulness is the viewer's own (a list field, like my_rating), so its axis
// is marked personal: drawn only for a holder of self.list (`canTrack`) and
// written through `onOwnChange`, which the page sends to /api/me.
import { useAuth } from "../../contexts/AuthContext";
import { Chip, Eyebrow, Slip } from "../ui/primitives";
import { SELECT_CLS } from "./MyTrackerCard";
import {
  COMPLETION_LEVELS,
  GAME_ACHIEVEMENT_FLAGS,
  GAME_COMPLETION_FLAGS,
  H_COMIC_USEFULNESS,
} from "../../config/fieldOptions";

// Field key -> label, vocabulary and, for a personal axis, { personal: true }.
// Completion Level is a ladder of depth and the other three are independent
// axes, so the ladder leads and the axes follow it in the order the Add form
// uses.
export const GAME_COMPLETION_AXES = [
  ["completion_level", "Completion Level", COMPLETION_LEVELS],
  ["all_endings", "All Endings", GAME_COMPLETION_FLAGS],
  // Its own vocabulary: Fully (hidden ones too) before Yes (all but those).
  ["all_achievements", "All Achievements", GAME_ACHIEVEMENT_FLAGS],
  ["all_collected", "All Collected", GAME_COMPLETION_FLAGS],
];

export const H_GAME_COMPLETION_AXES = [
  ["completion_level", "Completion Level", COMPLETION_LEVELS],
  ["all_endings", "All Endings", GAME_COMPLETION_FLAGS],
  ["all_cg", "All CG", GAME_COMPLETION_FLAGS],
  ["usefulness", "Usefulness", H_COMIC_USEFULNESS, { personal: true }],
];

export default function GameCompletionBlock({
  game,
  isAdmin,
  canTrack,
  onChange,
  onOwnChange,
  axes = GAME_COMPLETION_AXES,
  idPrefix = "game",
}) {
  // A guest has no completion record, for the same reason they have no
  // tracker: every field here is one person's answer. Guarded in the component
  // rather than at the page, matching MyTrackerCard and NovelTrackerBlock.
  const { username } = useAuth();
  if (!username) return null;
  // A personal axis is the viewer's own value: absent without self.list.
  const shown = axes.filter(([, , , flags]) => !flags?.personal || canTrack);
  if (shown.length === 0) return null;

  return (
    <Slip title="Completion">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {shown.map(([key, label, options, flags]) => {
          const editable = flags?.personal ? canTrack : isAdmin;
          const save = flags?.personal ? onOwnChange : onChange;
          return (
            <div key={key} className="space-y-1.5">
              <Eyebrow as="label" htmlFor={`${idPrefix}-${key}`} className="block">
                {label}
              </Eyebrow>
              {editable ? (
                <select
                  id={`${idPrefix}-${key}`}
                  value={game[key] || ""}
                  onChange={(e) =>
                    // "" is the select's unset option; the column's unrecorded
                    // state is NULL, so an emptied axis must not travel as "".
                    save({ [key]: e.target.value || null })
                  }
                  className={SELECT_CLS}
                >
                  <option value="">—</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <Chip>{game[key] || "—"}</Chip>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Slip>
  );
}
