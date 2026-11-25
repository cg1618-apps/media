// Frontend: the sorts an entity library offers (studio, publisher, person,
// character), as SortControl options with their comparators for
// EntityLibrary. Name, A to Z; the count the library shows (credits, or a
// character's appearances), most first; and My rating, best first, for a
// viewer with a list of its own. A tie falls through to the name.
import { getRatingWeight } from "../utils/media";

export function entitySorts({ count, countLabel, ownData }) {
  return [
    { value: "name", label: "Name" },
    {
      value: count,
      label: countLabel,
      descending: true,
      compare: (a, b) => (b[count] ?? 0) - (a[count] ?? 0),
    },
    ...(ownData
      ? [
          {
            value: "my_rating",
            label: "My rating",
            descending: true,
            compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
          },
        ]
      : []),
  ];
}
