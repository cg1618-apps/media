// Frontend: info component file for EntityHeading.
//
// The head of an entity detail page (person, studio, publisher, character,
// identity): one mono line with the entity's kind and its count - credited
// entries, or appearances - then the name in the display face.
import { Eyebrow } from "../ui/primitives";

/** "1 credited entry", "3 credited entries". */
export function creditedEntries(count) {
  return `${count} credited entr${count === 1 ? "y" : "ies"}`;
}

/** "1 appearance", "3 appearances". */
export function appearances(count) {
  return `${count} appearance${count === 1 ? "" : "s"}`;
}

export default function EntityHeading({ kind, count, name }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <Eyebrow>{kind}</Eyebrow>
        <span className="font-mono text-[11px] text-text-faint">{count}</span>
      </div>
      <h1 className="font-display text-4xl font-semibold text-text leading-tight">{name}</h1>
    </div>
  );
}
