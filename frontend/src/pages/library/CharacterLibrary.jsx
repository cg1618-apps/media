// Frontend: page component file for CharacterLibrary.
//
// Characters are a public entity, not a media type — this sits at
// /library/character as a standalone component, outside LIBRARY_CONFIGS,
// drawn by the EntityLibrary the other entity libraries share. Each character
// is a card, and so is each of its identities (lib/characterCards.js); the
// filters, sorts and list view all run over those cards.
import { useCallback, useEffect, useMemo, useState } from "react";

import CharacterCard from "../../components/cards/CharacterCard";
import EntityLibrary from "../../components/layout/EntityLibrary";
import { characterColumns } from "../../components/layout/entityColumns";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { characterCards } from "../../lib/characterCards";
import { characterFilterDefs } from "../../lib/entityFilters";
import { useEntityHref } from "../../lib/entityPath";
import { entitySorts } from "../../lib/entitySorts";
import { withoutPersonal } from "../../lib/libraryScope";
import { cleanString } from "../../utils/media";

// The count reads in cards; everything else says characters.
const NOUNS = { one: "card", many: "cards", searchMany: "characters" };

// Searches all four name fields, not just the displayed one: someone looking
// a character up by their Japanese name must find them even when English is
// the configured display name. A character's cards answer to the names of
// all its identities too.
function matchesSearch(card, q) {
  return (card.search_names || []).some((n) => cleanString(n).includes(q));
}

const cardKey = (card) => card.card_id;

export default function CharacterLibrary() {
  const [allCharacters, setAllCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Each character, then each of its identities as a card of its own.
  const cards = useMemo(() => characterCards(allCharacters), [allCharacters]);

  const auth = useAuth();
  // My rating is the viewer's own (self.list): without the key there is no
  // rating sort, filter or column at all.
  const { ownData } = useViewScope();
  const entityHref = useEntityHref();
  const filterDefs = useMemo(() => characterFilterDefs(auth, { ownData }), [auth, ownData]);
  const sorts = useMemo(
    () => entitySorts({ count: "casting_count", countLabel: "Appearances", ownData }),
    [ownData],
  );
  const columns = useMemo(
    () => (ownData ? characterColumns() : withoutPersonal(characterColumns())),
    [ownData],
  );
  // An identity card carries the identity's own public_id and opens its page.
  const rowPath = useCallback(
    (card) => entityHref(card.card_kind === "identity" ? "identity" : "character", card),
    [entityHref],
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoints.character.list(), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load data");
        setAllCharacters(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <EntityLibrary
      title="Characters"
      nouns={NOUNS}
      items={cards}
      loading={loading}
      error={error}
      filterDefs={filterDefs}
      matchesSearch={matchesSearch}
      sorts={sorts}
      renderCard={(card) => <CharacterCard key={card.card_id} character={card} />}
      columns={columns}
      rowPath={rowPath}
      rowKey={cardKey}
    />
  );
}
