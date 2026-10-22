// Frontend: the Genre Main, Genre Sub and 標籤 Label pickers, as one section of
// the Add and Modify tabs of every type in GENRE_LABEL_TYPES
// (lib/genreLabelFields.js). Each picker offers the values of its category
// scoped to `mediaType` or to no type at all - getSourceValues does the
// filtering - so a genre added on a manga is not offered on a movie. Below
// them, TagReplace offers to replace all three from another entry of the
// series or franchise.
import MultiSelect from "./MultiSelect";
import TagReplace from "./TagReplace";
import { Field, SectionHeader } from "./FormField";
import { getSourceValues } from "../../lib/formatters";
import {
  GENRE_LABEL_FIELDS,
  GENRE_LABEL_KEYS,
  genreLabelSource,
} from "../../lib/genreLabelFields";

/**
 * `values` is the tab's form state and `onChange(key, value)` its updater -
 * the same pair every tab already hands its own fields. `sources` is the
 * page's suggestion bag (lib/sources.js). `franchiseId`, `seriesId` and
 * `entryId` (Modify only) feed TagReplace.
 */
export default function GenreLabelFields({
  mediaType,
  values,
  onChange,
  sources,
  franchiseId,
  seriesId,
  entryId,
}) {
  return (
    <>
      <SectionHeader icon="fa-tags" title="Genres & Labels" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GENRE_LABEL_FIELDS.map(({ key, category, label, placeholder }) => (
          <Field key={key} label={label}>
            <MultiSelect
              options={getSourceValues(sources, genreLabelSource(mediaType, category))}
              value={values[key]}
              onChange={(v) => onChange(key, v)}
              placeholder={placeholder}
              limit={null}
            />
          </Field>
        ))}
      </div>
      <TagReplace
        mediaType={mediaType}
        franchiseId={franchiseId}
        seriesId={seriesId}
        entryId={entryId}
        fields={GENRE_LABEL_KEYS}
        onChange={onChange}
      />
    </>
  );
}
