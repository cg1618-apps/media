// Frontend: a Game Platform console brings its family, and the main platforms
// come first - the browser half of with_platform_families in
// app/utils/game_vocabulary.py.
//
// Game Platform has two grains: a main platform, which is a family (PC,
// PlayStation, Xbox, Nintendo, Mobile, Browser), and the specific platforms,
// the consoles inside one (PS5, Switch, ...). Picking a console adds its
// family, and removing a family while one of its consoles stays picked puts
// it straight back. Every main platform sits ahead of every specific one,
// with no heading between them. The server does the same on every write, so
// the form shows what the save stores.
//
// Which family a console belongs to is not written here: every Game Platform
// option the API serves carries its `family` (null on a family), so the map
// is read off the options the form already loads.

import { joinTags, splitTags } from "./labelTags";

export const PLATFORM_CATEGORY = "Game Platform";

// The main platforms, in order. A copy of the families in GAME_PLATFORMS;
// tests/unit/test_game_platform_vocabulary.py keeps the two in step. Here
// rather than read off the options because the library's Platform filter
// orders its chips without loading any.
export const MAIN_PLATFORMS = ["PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "Browser"];

const MAIN = new Set(MAIN_PLATFORMS);

// `values` with the main platforms first, in MAIN_PLATFORMS order, then every
// other value in the order it had.
export function mainPlatformsFirst(values) {
  const held = new Set(values);
  return [...MAIN_PLATFORMS.filter((p) => held.has(p)), ...values.filter((v) => !MAIN.has(v))];
}

// {console: family}, from the form's loaded options.
export function platformFamilies(options) {
  const out = {};
  for (const option of options || []) {
    if (option.category === PLATFORM_CATEGORY && option.family) {
      out[option.value] = option.family;
    }
  }
  return out;
}

// The comma-joined tags string with each console's family added when it is
// not there already, then the main platforms put first in their fixed order
// (mainPlatformsFirst).
export function withPlatformFamilies(raw, families) {
  const tags = splitTags(raw);
  const present = new Set(tags);
  const expanded = [];
  for (const tag of tags) {
    const family = families[tag];
    if (family && !present.has(family)) {
      expanded.push(family);
      present.add(family);
    }
    expanded.push(tag);
  }
  const out = mainPlatformsFirst(expanded);
  return out.length === tags.length && out.every((t, i) => t === tags[i]) ? raw : joinTags(out);
}
