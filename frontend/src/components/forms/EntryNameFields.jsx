// Frontend: the name inputs of an entry form, shared by every media type's
// Add and Modify body.
//
// One layout for every type, in the order the detail page's naming card reads
// (config/namingConfigs.js): CN top-left beside EN, Romaji beside the native
// name (JP, or KR), and Alt across the full width. A type lists only the
// names it has - movie, TV and cartoon carry no Romaji or JP - and a row with
// one name keeps it in the left half rather than stretching it. None is marked
// required: the Add page asks for at least one name, not for a given one.
//
// `shows(key)` narrows the list further at render time. H-Comic passes
// showsField from lib/hComicRegion.js, so a JP entry shows its JP name and a
// KR entry its KR one; the hidden name is kept in the form, never cleared.
import { Field, inputCls } from "./FormField";

const NAME_LABELS = {
  cn: "CN",
  en: "EN",
  roman: "Romaji",
  jp: "JP",
  kr: "KR",
  alt: "Alt",
};

const DEFAULT_PLACEHOLDERS = {
  cn: "Chinese title",
  en: "English title",
  roman: "Romanised title",
  jp: "Japanese title",
  kr: "Korean title",
  alt: "Alternative title",
};

const PAIRED_ROWS = [
  ["cn", "en"],
  ["roman", "jp", "kr"],
];

/**
 * `prefix` is the column prefix (`anime_movie`, `tv`, `h_comic`) and `label`
 * the type's display name ("Anime Movie"), so the inputs are
 * `${prefix}_name_${suffix}` labelled "`${label}` Name CN". `names` is the
 * suffixes this type carries, out of cn, en, roman, jp, kr and alt - their
 * order here does not matter, the layout fixes it. `placeholders` overrides
 * the default placeholder per suffix.
 */
export default function EntryNameFields({
  f,
  u,
  prefix,
  label,
  names = ["cn", "en", "roman", "jp", "alt"],
  shows,
  placeholders,
}) {
  const keyOf = (suffix) => `${prefix}_name_${suffix}`;
  const present = (suffix) =>
    names.includes(suffix) && (!shows || shows(keyOf(suffix)));

  const input = (suffix) => {
    const key = keyOf(suffix);
    const text = `${label} Name ${NAME_LABELS[suffix]}`;
    return (
      <Field key={key} label={text}>
        <input
          className={inputCls}
          aria-label={text}
          value={f[key] ?? ""}
          onChange={(e) => u(key, e.target.value)}
          placeholder={placeholders?.[suffix] ?? DEFAULT_PLACEHOLDERS[suffix]}
        />
      </Field>
    );
  };

  return (
    <>
      {PAIRED_ROWS.map((row) => {
        const shown = row.filter(present);
        if (shown.length === 0) return null;
        return (
          <div key={row[0]} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shown.map(input)}
          </div>
        );
      })}
      {present("alt") && input("alt")}
    </>
  );
}
