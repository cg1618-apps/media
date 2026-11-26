// Frontend: the profile inputs a character and a person share - gender and
// (on Modify) which entry lends its cover when there is no photo. My rating is
// not here: it is the viewer's own, set on the detail page, and the catalogue
// write does not carry it.
//
// CharacterFields and PersonFields both render these, so the two forms offer
// the same closed vocabularies and the same fallback picker rather than two
// copies of each. ContentRatingField is the person, studio and publisher
// forms' one shared select.
import { useQuery } from "@tanstack/react-query";

import { Field, selectCls } from "./FormField";
import QuickPicks from "./QuickPicks";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import {
  CONTENT_RATINGS,
  CONTENT_RATING_NORMAL,
  GENDERS,
  PERSON_GENDERS,
  contentRatingLabel,
} from "../../config/fieldOptions";
import { releaseYear } from "../../lib/releaseDate";

// The genders offered as one-click chips beside the Gender select - the two
// almost every record takes. The select still offers every value of its
// vocabulary and is how the rest are picked. Filtered against that
// vocabulary, which /api/constants refreshes in place, so a value the server
// stops serving is not offered.
const GENDER_QUICK_PICKS = ["男", "女"];

/**
 * Gender: quick-pick chips beside a select. Stores "" for unset; the savers
 * send null. `kind` picks the vocabulary: a character's five GENDERS, or a
 * person's PERSON_GENDERS (男 / 女).
 */
export function GenderField({ form, update, kind = "character" }) {
  const genders = kind === "person" ? PERSON_GENDERS : GENDERS;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Gender">
        <div className="flex items-center gap-2">
          <QuickPicks
            label="Gender quick picks"
            className="shrink-0"
            options={GENDER_QUICK_PICKS.filter((g) => genders.includes(g))}
            value={form.gender ?? ""}
            onChange={(v) => update("gender", v)}
          />
          <div className="flex-1 min-w-0">
            <select
              aria-label="Gender"
              className={selectCls}
              value={form.gender ?? ""}
              onChange={(e) => update("gender", e.target.value)}
            >
              <option value="">—</option>
              {genders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Field>
    </div>
  );
}

/**
 * Content rating: the lowest access mode a person, studio or publisher is
 * shown in. Never blank - an unset form reads as Normal, the default.
 */
export function ContentRatingField({ form, update }) {
  return (
    <Field
      label="Content rating"
      hint="Normal shows in every mode, safe included; Borderline from the borderline mode up; Unrestricted only in unrestricted."
    >
      <select
        aria-label="Content rating"
        className={selectCls}
        value={form.content_rating || CONTENT_RATING_NORMAL}
        onChange={(e) => update("content_rating", e.target.value)}
      >
        {CONTENT_RATINGS.map((value) => (
          <option key={value} value={value}>
            {contentRatingLabel(value)}
          </option>
        ))}
      </select>
    </Field>
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
