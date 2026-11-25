// Frontend: the table-view columns of the entity libraries (studio,
// publisher, person, character), for LibraryTable. The media libraries'
// columns are libraryColumns.jsx; these follow the same markup - mono
// numerals, ink chips, a hairline-bordered My rating - and reuse its My
// column, which is `personal` and so dropped for a viewer without a list.
//
// Every entity table opens with the thumbnail and name, ends with the
// count (credits, or a character's appearances) and My, and puts the columns
// that tell one entity from another between them.
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { FALLBACK_SVG, focusStyle, getCoverUrl, thumbUrl } from "../../lib/covers";
import { publisherKindLabels } from "../../lib/entityFilters";
import { PERSON_SUB_TABS, personTypeLabel } from "../forms/PersonSubTabBar";
import { Chip } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";
import { myRatingColumn } from "./libraryColumns";

const HIDDEN = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

function Chips({ values, dashed = () => false }) {
  if (values.length === 0) return "-";
  return (
    <span className="inline-flex flex-wrap gap-1 justify-center">
      {values.map((v) => (
        <Chip key={v} dashed={dashed(v)} className="text-[9px]">
          {v}
        </Chip>
      ))}
    </span>
  );
}

/**
 * The thumbnail and the display name. `image(item)` and `focus(item)` read
 * the picture the card shows (the server-resolved display_* fields, falling
 * back to the entity's own file).
 */
export function entityNameColumn({ header = "Name", image, focus, fallbackName }) {
  return {
    key: "name",
    header,
    tdClass: "text-sm font-medium text-text",
    render: (item) => {
      const name = item.display_name || fallbackName;
      return (
        <span className="flex items-center gap-3 min-w-0">
          <span className="block w-8 h-10 shrink-0 overflow-hidden border border-border bg-surface-2">
            <LazyImage
              src={thumbUrl(getCoverUrl(image(item)))}
              alt=""
              className="w-full h-full object-cover"
              style={focusStyle(focus(item))}
              onError={(e) => {
                e.target.src = FALLBACK_SVG;
              }}
            />
          </span>
          <span className="truncate" title={name}>
            {name}
          </span>
        </span>
      );
    },
  };
}

/** The media types the entity's visible entries are, as chips. */
export function entryTypesColumn() {
  return {
    key: "types",
    header: "Entry types",
    thClass: HIDDEN.lg,
    tdClass: `text-center ${HIDDEN.lg}`,
    render: (item) => <Chips values={(item.media_types || []).map(mediaTypeLabel)} />,
  };
}

/** A count off one field: credits, or a character's appearances. */
export function countColumn(field, header) {
  return {
    key: field,
    header,
    tdClass: "text-center font-mono text-xs text-text tabular-nums",
    render: (item) => item[field] ?? 0,
  };
}

/** One text value, or "-". */
function textColumn(key, header, read, hidden = "md") {
  return {
    key,
    header,
    thClass: HIDDEN[hidden],
    tdClass: `text-xs text-center text-text-muted ${HIDDEN[hidden]}`,
    render: (item) => read(item) || "-",
  };
}

const credits = () => countColumn("credit_count", "Credits");

/** Studio: name, country, entry types, credits, my rating. */
export function studioColumns() {
  return [
    entityNameColumn({
      header: "Studio",
      image: (s) => s.display_logo_file ?? s.logo_file,
      focus: (s) => s.display_logo_focus ?? s.logo_focus,
      fallbackName: "Unknown Studio",
    }),
    textColumn("country", "Country", (s) => (s.countries || []).join(", ")),
    entryTypesColumn(),
    credits(),
    myRatingColumn(),
  ];
}

/** Publisher: name, kind, country, entry types, credits, my rating. */
export function publisherColumns() {
  return [
    entityNameColumn({
      header: "Publisher",
      image: (p) => p.display_logo_file ?? p.logo_file,
      focus: (p) => p.display_logo_focus ?? p.logo_focus,
      fallbackName: "Unknown Publisher",
    }),
    {
      key: "kind",
      header: "Kind",
      thClass: HIDDEN.md,
      tdClass: `text-center ${HIDDEN.md}`,
      render: (p) => <Chips values={publisherKindLabels(p)} />,
    },
    textColumn("country", "Country", (p) => p.country),
    entryTypesColumn(),
    credits(),
    myRatingColumn(),
  ];
}

/** The person types a person holds, in PERSON_SUB_TABS order, in Chinese. */
export function personTypeLabels(person) {
  const held = new Set((person.roles || []).map((r) => r.role));
  return PERSON_SUB_TABS.filter((t) => held.has(t.key)).map((t) => personTypeLabel(t.key));
}

/** Person: name, type, gender, entry types, credits, my rating. */
export function personColumns() {
  return [
    entityNameColumn({
      header: "Person",
      image: (p) => p.display_photo_file ?? p.photo_file,
      focus: (p) => p.display_photo_focus ?? p.photo_focus,
      fallbackName: "Unknown Person",
    }),
    {
      key: "type",
      header: "Type",
      tdClass: "text-center",
      render: (p) => <Chips values={personTypeLabels(p)} />,
    },
    textColumn("gender", "Gender", (p) => p.gender),
    entryTypesColumn(),
    credits(),
    myRatingColumn(),
  ];
}

/**
 * Character: name, card (an identity card's chip dashed, the line that means
 * identity across the app), role, gender, entry types, appearances, my
 * rating. An identity card carries no rating of its own.
 */
export function characterColumns() {
  const my = myRatingColumn();
  return [
    entityNameColumn({
      header: "Character",
      image: (c) => c.display_photo_file ?? c.photo_file,
      focus: (c) => c.display_photo_focus ?? c.photo_focus,
      fallbackName: "Unknown Character",
    }),
    {
      key: "card",
      header: "Card",
      thClass: HIDDEN.md,
      tdClass: `text-center ${HIDDEN.md}`,
      render: (c) =>
        c.card_kind === "identity" ? (
          <span className="inline-flex flex-col items-center gap-0.5">
            <Chip dashed className="text-[9px]">
              Identity
            </Chip>
            {c.character_display_name && (
              <span className="font-mono text-[10px] text-text-faint">
                {c.character_display_name}
              </span>
            )}
          </span>
        ) : (
          <Chip className="text-[9px]">Character</Chip>
        ),
    },
    textColumn("role", "Role", (c) => c.role),
    textColumn("gender", "Gender", (c) => c.gender, "lg"),
    entryTypesColumn(),
    countColumn("casting_count", "Appearances"),
    { ...my, render: (c) => (c.card_kind === "identity" ? "-" : my.render(c)) },
  ];
}
