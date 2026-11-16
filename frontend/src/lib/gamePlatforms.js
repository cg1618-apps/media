// Frontend: a Game Platform console brings its family - the browser half of
// with_platform_families in app/utils/game_vocabulary.py.
//
// Game Platform has two grains: a family (PlayStation, Nintendo, Xbox, PC,
// Mobile, Browser) and the consoles inside it (PS5, Switch, ...). Picking a
// console adds its family, and removing a family while one of its consoles
// stays picked puts it straight back. The server does the same on every
// write, so the form shows what the save stores.
//
// Which family a console belongs to is not written here: every Game Platform
// option the API serves carries its `family` (null on a family), so the map
// is read off the options the form already loads.

import { joinTags, splitTags } from "./labelTags";

export const PLATFORM_CATEGORY = "Game Platform";

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

// The comma-joined tags string with each console's family put in just before
// its first console, when it is not there already. Nothing else moves.
export function withPlatformFamilies(raw, families) {
  const tags = splitTags(raw);
  const present = new Set(tags);
  const out = [];
  for (const tag of tags) {
    const family = families[tag];
    if (family && !present.has(family)) {
      out.push(family);
      present.add(family);
    }
    out.push(tag);
  }
  return out.length === tags.length ? raw : joinTags(out);
}
