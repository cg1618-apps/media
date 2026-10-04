// Frontend: what a pick in an Add tab's external search writes into the form.
//
// ExternalSearchBox hands over one ExternalSearchResult row; these turn it
// into form fields. A pick always identifies the entry - the id and link
// columns are overwritten - and touches a name only where the admin left that
// name blank. Everything else is the Fill pipeline's job (or, for anime and a
// seiyuu or character, the create path's own MAL autofill).
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
