// Frontend: what a pick in an Add tab's external search writes into the form.
//
// ExternalSearchBox hands over one ExternalSearchResult row; these turn it
// into form fields. A pick always identifies the entry - the id and link
// columns are overwritten - and touches a name only where the admin left that
// name blank. A MAL pick on anime, anime movie, manga or novel then asks the
// server for the rest of MAL's record (makeMalPick) and fills only the fields
// still blank. Everything else is the Fill pipeline's job (or, for a seiyuu or
// character, the create path's own MAL autofill).
import { flushSync } from "react-dom";

import { fetchJson } from "../api/client";

/** MAL, IGDB and Comic Vine ids are integers; a non-number writes nothing. */
export function toIntId(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? "" : n;
}

/** Open Library ("OL…W") and IMDb ("tt…") ids are strings. */
export function toStringId(value) {
  return value == null ? "" : String(value);
}

/**
 * The form patch for one pick.
 *
 * spec: { idField?, cast?, linkField, nameField?, nameOf? }
 * - `idField` is optional: person and character forms carry only the link,
 *   and the server derives the id from it.
 * - `nameOf(result)` picks the value for `nameField` (default: the title).
 */
export function externalPickPatch(form, result, spec) {
  const { idField, cast = toStringId, linkField, nameField, nameOf } = spec;
  const patch = {};
  if (idField) patch[idField] = cast(result.external_id);
  if (linkField) patch[linkField] = result.link || form[linkField] || "";
  if (nameField && !String(form[nameField] ?? "").trim()) {
    const name = (nameOf ? nameOf(result) : result.title) || "";
    if (name) patch[nameField] = name;
  }
  return patch;
}

/** A pick handler: merges the patch through `setter` and confirms with a toast. */
export function makeExternalPick(setter, showToast, spec) {
  return (result) => {
    setter((form) => ({ ...form, ...externalPickPatch(form, result, spec) }));
    showToast("success", `Linked to ${spec.source}: ${result.title}`);
  };
}

/**
 * A TMDB pick. Movie, TV show and cartoon rows are keyed by IMDb, not TMDB, so
 * the picked result's ref is resolved first (`resolveUrl(ref)` answers
 * {imdb_id, imdb_link}); only then are imdb_id and imdb_link written. A 404
 * (TMDB has no IMDb id) or a 502 writes nothing and says so.
 */
export function makeTmdbPick(setter, showToast, { resolveUrl, nameField }) {
  return async (result) => {
    let imdb;
    try {
      imdb = await fetchJson(resolveUrl(result.external_id));
    } catch (e) {
      const reason =
        e instanceof TypeError || !e?.message
          ? "Could not reach the TMDB lookup."
          : e.message;
      showToast(
        "error",
        /by hand/i.test(reason) ? reason : `${reason} Enter the IMDb link by hand.`,
      );
      return;
    }
    if (!imdb?.imdb_id) {
      showToast("error", "TMDB has no IMDb id for this title. Enter the IMDb link by hand.");
      return;
    }
    const linked = { ...result, external_id: imdb.imdb_id, link: imdb.imdb_link };
    setter((form) => ({
      ...form,
      ...externalPickPatch(form, linked, {
        idField: "imdb_id",
        cast: toStringId,
        linkField: "imdb_link",
        nameField,
      }),
    }));
    showToast("success", `Linked to TMDB: ${result.title} (${imdb.imdb_id})`);
  };
}

/** Blank for a prefill: null, undefined, or a string of only whitespace. */
export function isBlankValue(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/**
 * The part of `prefill` that lands on `form`: only the fields the admin has not
 * filled. A field is unfilled when it is blank, or when it still holds its
 * `defaults` value - a starting value such as anime's "Not Yet Aired" status
 * is not something the admin chose, and MAL's value is the better one.
 */
export function blankOnlyPatch(form, prefill, defaults = {}) {
  const patch = {};
  for (const [field, value] of Object.entries(prefill || {})) {
    if (isBlankValue(value)) continue;
    const current = form[field];
    if (isBlankValue(current) || current === defaults[field]) patch[field] = value;
  }
  return patch;
}

/**
 * A MAL pick for anime, anime movie, manga and novel. The id, link and romaji
 * name land at once, exactly as makeExternalPick writes them; then
 * `prefillUrl(id)` (GET /api/<type>/mal-prefill/{id}) is fetched and merged
 * into the fields the admin has not filled (blankOnlyPatch: blank, or still
 * at the type's `defaults` value) - a value the admin typed is never
 * replaced. A response that arrives after the admin picked something else
 * (the form's mal_id moved on) is dropped. A failed fetch keeps the id and
 * link, and says the details did not load.
 *
 * flushSync applies the merge before the toast, so the toast can say whether
 * the pick was still current and how many fields it filled.
 */
export function makeMalPick(setter, showToast, { nameField, prefillUrl, defaults }) {
  const spec = {
    source: "MAL",
    idField: "mal_id",
    cast: toIntId,
    linkField: "mal_link",
    nameField,
  };
  return async (result) => {
    const pickedId = toIntId(result.external_id);
    setter((form) => ({ ...form, ...externalPickPatch(form, result, spec) }));

    let prefill;
    try {
      prefill = await fetchJson(prefillUrl(result.external_id));
    } catch (e) {
      const reason = e instanceof TypeError || !e?.message ? "" : ` ${e.message}`;
      showToast(
        "error",
        `Linked to MAL: ${result.title}, but its details could not be loaded.${reason}`,
      );
      return;
    }

    let filled = null;
    flushSync(() => {
      setter((form) => {
        if (form.mal_id !== pickedId) {
          filled = null;
          return form;
        }
        const patch = blankOnlyPatch(form, prefill, defaults);
        filled = Object.keys(patch).length;
        return filled ? { ...form, ...patch } : form;
      });
    });
    if (filled === null) return;
    const detail =
      filled === 0
        ? "no blank field to fill"
        : `${filled} field${filled === 1 ? "" : "s"} filled`;
    showToast("success", `Linked to MAL: ${result.title} (${detail})`);
  };
}
