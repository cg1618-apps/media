// The franchise and series hubs' Characters tab: every character cast on the
// tier's entries, once each, plus a card for each identity cast there.
//
// Characters, not the cast: a character in five entries is one card, with
// their own picture and overall role, not five cast rows. The server scopes
// the list (GET /api/character/?franchise_id= or ?series_id=) to castings on
// entries this viewer may see and narrows each character's identities to the
// ones cast there; lib/characterCards.js groups the cards by role.
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { characterCardsByRole } from "../../lib/characterCards";
import CharacterCard from "../cards/CharacterCard";
import { Eyebrow } from "../ui/primitives";
import { HubEmpty, HubLoading } from "./HubStates";

/**
 * scope  "franchise" or "series"
 * tierId the tier's system_id
 */
export default function HubCharacters({ scope, tierId }) {
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

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <div className="flex items-center gap-3 mb-3">
            <Eyebrow as="h3" className="shrink-0">
              {group.label}
            </Eyebrow>
            <span className="font-mono text-[10px] text-text-faint">
              {group.cards.length}
            </span>
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
  );
}
