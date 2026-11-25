// Frontend: info component file for GenresCard.
//
// The "Genres" InfoCard of the anime, anime movie, movie, TV, cartoon, manga
// and book detail pages - directly below Information, and on manga and book
// below Production - seven of the types that carry the three shared
// classification tags (GENRE_LABEL_TYPES in lib/genreLabelFields.js) - and of
// comic, the eighth, after its Events card:
// Genre (Main) and Genre (Sub) side by side, Label below - the card the
// game page draws for its own Genre / Theme / Label, set apart from the
// Information card so the tags are not read as facts about the release.
//
// Renders nothing when the entry has none of the three, so a page never
// shows an empty card of dashes. Content labels (NSFW etc.) are not these
// and stay with ContentLabelChips.
import InfoCard from "./InfoCard";

function isSet(value) {
  return value != null && String(value).trim() !== "";
}

export function hasGenreTags(item) {
  return isSet(item?.genre_main) || isSet(item?.genre_sub) || isSet(item?.label);
}

export default function GenresCard({ item }) {
  if (!hasGenreTags(item)) return null;
  return (
    <InfoCard
      title="Genres"
      fields={[
        [
          { label: "Genre (Main)", value: item.genre_main },
          { label: "Genre (Sub)", value: item.genre_sub },
        ],
        { label: "Label", value: item.label },
      ]}
    />
  );
}
