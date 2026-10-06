// Frontend: a character's appearance or trait list as a row of Chips - the
// primitive every other short label on the site is set in. Shared by the
// character page and the identity page, which shows its character's tags.
import { Chip } from "../ui/primitives";

// null for an empty list, so the InfoRow shows its "—" (an element that
// renders nothing would not).
export function tagChips(values) {
  if (!values?.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Chip key={value}>{value}</Chip>
      ))}
    </span>
  );
}
