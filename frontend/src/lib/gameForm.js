// Frontend: the game form's credit and tag fields, as the Add and Modify
// pages check and hand them over before a save.
//
// One list for both pages, as lib/hGameForm.js is for h-game. The developer
// and publisher are PICK-ONLY: they name an existing studio or publisher, and
// a save naming one that does not exist is refused (pickOnlyRefusal) rather
// than creating it - a company is made from its own Add tab. Every other field
// is quick-created through ensureSourceValues, with the `game` scope so the
// new value is offered by the picker that created it.
import {
  GAME_PUBLISHER_SOURCE,
  GAME_STUDIO_SOURCE,
} from "../config/formFields/fieldMeta";

const GAME_PICK_ONLY_FIELDS = [
  ["studio", GAME_STUDIO_SOURCE, "Developer", "Studio"],
  ["publisher", GAME_PUBLISHER_SOURCE, "Publisher", "Publisher"],
];

const GAME_SOURCE_FIELDS = [
  ["director", { kind: "person", role: "director", scope: "game" }],
  ["composer", { kind: "person", role: "composer", scope: "game" }],
  ["game_genre", { kind: "option", category: "Game Genre", scope: "game" }],
  ["game_theme", { kind: "option", category: "Game Theme", scope: "game" }],
  ["game_mode", { kind: "option", category: "Game Mode", scope: "game" }],
  ["combat_mode", { kind: "option", category: "Combat Mode", scope: "game" }],
  ["game_platform", { kind: "option", category: "Game Platform", scope: "game" }],
  ["label", { kind: "option", category: "Label", scope: "game" }],
];

/** `[{source, values, label, tab}]` for pickOnlyRefusal; `split` turns "a, b" into names. */
export function gamePickOnlyFields(form, split) {
  return GAME_PICK_ONLY_FIELDS.map(([key, source, label, tab]) => ({
    source,
    values: split(form[key]),
    label,
    tab,
  }));
}

/** `[{source, values}]` for ensureSourceValues: every field it may create. */
export function gameSourceFields(form, split) {
  return GAME_SOURCE_FIELDS.map(([key, source]) => ({
    source,
    values: split(form[key]),
  }));
}
