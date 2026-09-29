// Frontend: the profile inputs a character and a person share - gender, my
// rating, and (on Modify) which entry lends its cover when there is no photo.
//
// CharacterFields and PersonFields both render these, so the two forms offer
// the same closed vocabularies and the same fallback picker rather than two
// copies of each.
import { useQuery } from "@tanstack/react-query";

import { Field, selectCls } from "./FormField";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import { GENDERS, MY_RATINGS } from "../../config/fieldOptions";
import { releaseYear } from "../../lib/releaseDate";

/** Gender and My Rating selects. Both store "" for unset; the savers send null. */
export function GenderRatingFields({ form, update }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Gender">
        <select
          aria-label="Gender"
          className={selectCls}
          value={form.gender ?? ""}
          onChange={(e) => update("gender", e.target.value)}
        >
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>
      <Field label="My Rating">
        <select
          aria-label="My Rating"
          className={selectCls}
          value={form.my_rating ?? ""}
          onChange={(e) => update("my_rating", e.target.value)}
        >
          <option value="">Unrated</option>
          {MY_RATINGS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/**
 * The entries of a character's or person's /entries groups, once each: a
 * person credited twice on one entry (director and writer) appears in two
 * groups, and the picker lists the entry once.
 */
export function uniqueGroupEntries(groups) {
  const seen = new Map();
  for (const group of groups || []) {
    for (const entry of group.entries || []) {
      if (!seen.has(entry.system_id)) {
        seen.set(entry.system_id, { ...entry, media_type: group.media_type });
      }
    }
  }
  return [...seen.values()];
}

// Labelled like FranchiseModifyTab's cover picker: name, year, type.
export function entryOptionLabel(entry) {
  const yr = releaseYear(entry.release_date);
  return `${entry.display_name || "Untitled"}${yr ? ` (${yr})` : ""} [${entry.media_type}]`;
}

/**
 * Which entry's picture stands in for a missing photo. Only on Modify: an
 * unsaved character or person has no entries to choose from. Empty is auto -
 * the server picks the newest visible entry with a picture. For a character
 * an entry's picture is its casting photo first, then its cover; a person
 * only ever borrows covers.
 */
export function PhotoFallbackField({ ownerType, ownerId, value, onChange }) {
  const { data } = useQuery({
    queryKey: [`${ownerType}-entries`, ownerId],
    queryFn: () => fetchJson(endpoints[ownerType].entries(ownerId)),
    enabled: !!ownerId,
    staleTime: 10_000,
  });
  const entries = uniqueGroupEntries(data?.groups);
  const hint =
    ownerType === "character"
      ? "Which entry's cast picture (else its cover) to show when there is no photo — leave on auto to use the latest cast picture, else the latest cover"
      : "Whose cover to show when there is no photo — leave on auto to use the latest entry with a cover";

  return (
    <Field label="Photo fallback" hint={hint}>
      <select
        aria-label="Photo fallback"
        className={selectCls}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Auto (latest with cover) —</option>
        {entries.map((entry) => (
          <option key={entry.system_id} value={entry.system_id}>
            {entryOptionLabel(entry)}
          </option>
        ))}
      </select>
    </Field>
  );
}
