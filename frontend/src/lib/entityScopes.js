// The type and scope filters the admin Modify and Delete pages put over the
// person, character, studio and publisher lists.
//
// Scope matching is OR: a record shown for {anime, anime-movie} only has to
// be in scope for one of them. No scope ticked means any scope, and the All
// tab means any type - including a record that holds no type at all, which
// nothing forbids and which no type tab would ever list.
import { MEDIA_TYPES } from "../config/fieldOptions";

export const ALL_TAB_KEY = "all";
export const ALL_TAB = { key: ALL_TAB_KEY, label: "All", icon: "fa-users" };

export function toggleIn(list, value) {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

// The media types a record is in scope for. A publisher's are its stored
// scopes (what it is offered on); a studio and a character store none, so
// theirs are the media types of the visible entries they are credited on or
// cast in, which every list response already carries as media_types.
export function heldScopes(record) {
  return record.scopes || record.media_types || [];
}

// A person's scopes are those of their (role, scope) rows - for one role on
// that role's tab, or for every role they hold on the All tab.
export function personScopes(tab) {
  return (person) =>
    (person.roles || [])
      .filter((r) => tab === ALL_TAB_KEY || r.role === tab)
      .map((r) => r.scope);
}

export function inAnyScope(record, scopes, held = heldScopes) {
  return scopes.length === 0 || held(record).some((s) => scopes.includes(s));
}

// The chips worth offering for a list: every scope some record in it holds,
// in MEDIA_TYPES order. Read off the list rather than a hand-kept table, so a
// gated type the server withheld is never offered and a chip never selects
// nobody.
export function scopeChoices(records, held = heldScopes) {
  const present = new Set(records.flatMap(held));
  return MEDIA_TYPES.filter((type) => present.has(type));
}

// Characters by type: the All tab, then one per CHARACTER_ROLES value.
export function characterRoleTabs(roles) {
  return [
    ALL_TAB,
    ...roles.map((role) => ({ key: role, label: role })),
  ];
}

export function inCharacterRole(character, tab) {
  return tab === ALL_TAB_KEY || character.role === tab;
}
