// Frontend: the pieces of a book unit drawn wherever units are listed - the
// book's detail page and Future Releases - so a unit reads the same in both.
import LazyImage from "../ui/LazyImage";
import { getCoverUrl, thumbUrl } from "../../lib/covers";

// A unit's name: both languages where both are set, else its display key
// ("Vol. 5", "arc 2"), which every unit has.
export function unitName(unit) {
  return [unit.name_cn, unit.name_en].filter(Boolean).join(" / ") || unit.display_key;
}

// The unit's cover at thumbnail size, or nothing when it has none. A unit
// keeps no focal point (book_unit has no focus column), so the crop is the
// centre and the image says so with data-focus="none".
export function UnitCoverThumb({ unit, className = "w-8 h-11" }) {
  if (!unit.cover_image_file) return null;
  return (
    <LazyImage
      src={thumbUrl(getCoverUrl(unit.cover_image_file))}
      data-focus="none"
      alt={`Cover of ${unit.display_key}`}
      className={`${className} object-cover border border-border shrink-0`}
    />
  );
}

// "JP 2027-03 · TW 2027-09-15", leaving out a date that is not set.
export function UnitReleaseDates({ unit }) {
  const dates = [
    ["JP", unit.release_date_jp],
    ["TW", unit.release_date_tw],
  ].filter(([, value]) => value);
  if (dates.length === 0) return null;
  return (
    <span className="font-mono text-[11px] text-text-faint tabular-nums">
      {dates.map(([region, value]) => `${region} ${value}`).join(" · ")}
    </span>
  );
}
