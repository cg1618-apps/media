// Frontend: the owner types an image can be attached to, for the image
// library's owner-type filter (Images.jsx, ImagePicker's library modal).
//
// Mirrors app/routers/images.py's ATTACHABLE_OWNERS - the ten media entry
// tables plus six entity/content tables. Grouped into two optgroups rather
// than rendered as fifteen buttons in a row.
import { canSeeGatedType } from "../lib/gatedTypes";

export const IMAGE_OWNER_TYPE_GROUPS = [
  {
    label: "Media",
    options: [
      { value: "anime", label: "Anime" },
      { value: "anime-movie", label: "Anime Movie" },
      { value: "movie", label: "Movie" },
      { value: "tv-show", label: "TV Show" },
      { value: "cartoon", label: "Cartoon" },
      { value: "manga", label: "Manga" },
      { value: "novel", label: "Novel" },
      { value: "comic", label: "Comic" },
      { value: "game", label: "Game" },
      // Gated: the owner-type pickers filter it through visibleByType.
      { value: "h-comic", label: "H-Comic" },
    ],
  },
  {
    label: "Other",
    options: [
      { value: "staff", label: "Staff" },
      { value: "character", label: "Character" },
      { value: "publisher", label: "Publisher" },
      { value: "studio", label: "Studio" },
      { value: "quote", label: "Quote" },
      { value: "meme", label: "Meme" },
    ],
  },
];

/** The groups above without a gated owner type this session may not see. */
export function visibleImageOwnerTypeGroups(auth) {
  return IMAGE_OWNER_TYPE_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((opt) => canSeeGatedType(auth, opt.value)),
  }));
}
