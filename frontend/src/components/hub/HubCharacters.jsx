// The franchise and series hubs' Characters tab: every character cast on the
// tier's entries, once each, plus a card for each identity cast there.
//
// Characters, not the cast: a character in five entries is one card, with
// their own picture and overall role, not five cast rows. The server scopes
// the list (GET /api/character/?franchise_id= or ?series_id=) to castings on
// entries this viewer may see and narrows each character's identities to the
// ones cast there; lib/characterCards.js groups the cards by role.
//
// Above the groups sits a filter strip: kind (Character / Identity) and gender
// (男 / 女 / 其他) chips, multi-select, where all of a row's chips on and all
// off both mean no restriction; Character starts on. 其他 is every gender that
// is not 男 or 女, unset included, so that all three on really is everything.
// The sort - name, or my rating for a viewer with own data - applies inside
// each role group, in the direction SortControl's button sets.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { characterCardsByRole } from "../../lib/characterCards";
import CharacterCard from "../cards/CharacterCard";
import { useViewScope } from "../../hooks/useViewScope";
import { getRatingWeight } from "../../lib/formatters";
import { ClearAllButton, Eyebrow } from "../ui/primitives";
import { pillCls } from "./HubChrome";
import SortControl from "../layout/SortControl";
import { useSortState } from "../../hooks/useSortState";
import { HubEmpty, HubLoading } from "./HubStates";

const KINDS = [
  ["character", "Character"],
  ["identity", "Identity"],
];
const GENDER_CHIPS = ["男", "女", "其他"];
const DEFAULT_KINDS = ["character"];

function genderChip(gender) {
  return gender === "男" || gender === "女" ? gender : "其他";
}

// A row restricts only when some, but not all, of its chips are on.
function restricts(selected, chipCount) {
  return selected.size > 0 && selected.size < chipCount;
}

// The sorts the tab offers: name, A to Z, and for a viewer with own data my
// rating, best first.
function characterSortOptions(ownData) {
  return [
    { value: "name", label: "Name" },
    ...(ownData ? [{ value: "my_rating", label: "My rating", descending: true }] : []),
  ];
}

function visibleCards(cards, kinds, genders, sort, reversed) {
  let shown = cards;
  if (restricts(kinds, KINDS.length)) {
    shown = shown.filter((card) => kinds.has(card.card_kind));
  }
  if (restricts(genders, GENDER_CHIPS.length)) {
    shown = shown.filter((card) => genders.has(genderChip(card.gender)));
  }
  // With no characters beside them, identities sort by their own name rather
  // than following the character they belong to.
  if (!shown.some((card) => card.card_kind === "character")) {
    shown = [...shown].sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
  }
  // Stable, so equal ratings keep the name order and an identity (which
  // carries its character's rating) stays beside its character.
  if (sort === "my_rating") {
    shown = [...shown].sort((a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating));
  }
  return reversed ? [...shown].reverse() : shown;
}

function toggle(setter, value) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

/**
 * scope  "franchise" or "series"
 * tierId the tier's system_id
 */
export default function HubCharacters({ scope, tierId }) {
  const { ownData } = useViewScope();
  const [kinds, setKinds] = useState(() => new Set(DEFAULT_KINDS));
  const [genders, setGenders] = useState(() => new Set());
  const { sort, setSort, reversed, setReversed } = useSortState("name");
  const { data, isLoading, error } = useQuery({
    queryKey: ["tier-characters", scope, tierId],
    queryFn: () => fetchJson(endpoints.character.list(`${scope}_id=${tierId}`)),
    enabled: Boolean(tierId),
    staleTime: 30_000,
  });

  if (isLoading) return <HubLoading label="Loading characters..." />;
  if (error) {
    return (
      <p className="text-sm text-danger text-center py-12">
        Could not load the characters: {error.message}
      </p>
    );
  }

  const groups = characterCardsByRole(data);
  if (groups.length === 0) {
    return (
      <HubEmpty
        message={`No characters are cast on this ${scope}'s entries yet.`}
        hint="Characters come from each entry's cast."
      />
    );
  }

  const effectiveSort = ownData ? sort : "name";
  const shownGroups = groups
    .map((group) => ({
      ...group,
      cards: visibleCards(group.cards, kinds, genders, effectiveSort, reversed),
    }))
    .filter((group) => group.cards.length > 0);
  const anyChipOn = kinds.size > 0 || genders.size > 0;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <SortControl
          options={characterSortOptions(ownData)}
          value={effectiveSort}
          onChange={setSort}
          reversed={reversed}
          onReversedChange={setReversed}
        />
        <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>
        {KINDS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kinds.has(value)}
            onClick={() => toggle(setKinds, value)}
            className={pillCls(kinds.has(value))}
          >
            {label}
          </button>
        ))}
        <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>
        {GENDER_CHIPS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={genders.has(value)}
            onClick={() => toggle(setGenders, value)}
            className={pillCls(genders.has(value))}
          >
            {value}
          </button>
        ))}
        <ClearAllButton
          active={anyChipOn}
          onClick={() => {
            setKinds(new Set());
            setGenders(new Set());
          }}
          className="ml-auto"
        />
      </div>

      {shownGroups.length === 0 ? (
        <p className="text-center py-16 text-text-faint text-sm">
          No characters match the current filters.
        </p>
      ) : (
        <div className="space-y-8">
          {shownGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <div className="flex items-center gap-3 mb-3">
                <Eyebrow as="h3" className="shrink-0">
                  {group.label}
                </Eyebrow>
                <span className="font-mono text-[10px] text-text-faint">{group.cards.length}</span>
                <span className="flex-1 border-t border-dotted border-border-strong/60" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {group.cards.map((card) => (
                  <CharacterCard key={card.card_id} character={card} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
