// Frontend: page component file for PublisherLibrary.
//
// Publishers are a public entity, not a media type — this sits at
// /library/publisher as a standalone component, outside LIBRARY_CONFIGS, drawn
// by the EntityLibrary the other entity libraries share. The list URL comes
// from endpoints.publisher.list(), so the route lives in one place.
import { useCallback, useEffect, useMemo, useState } from "react";

import { PublisherCard } from "../../components/cards/StaffCard";
import EntityLibrary from "../../components/layout/EntityLibrary";
import { publisherColumns } from "../../components/layout/entityColumns";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { publisherFilterDefs } from "../../lib/entityFilters";
import { useEntityHref } from "../../lib/entityPath";
import { entitySorts } from "../../lib/entitySorts";
import { withoutPersonal } from "../../lib/libraryScope";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { cleanString } from "../../utils/media";

const NOUNS = { one: "publisher", many: "publishers" };

function matchesSearch(publisher, q) {
  return STUDIO_NAME_FIELDS.some(
    ({ field }) => publisher[field] && cleanString(publisher[field]).includes(q),
  );
}

export default function PublisherLibrary() {
  const [allPublishers, setAllPublishers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const auth = useAuth();
  // My rating is the viewer's own (self.list): without the key there is no
  // rating sort, filter or column at all.
  const { ownData } = useViewScope();
  const entityHref = useEntityHref();
  const filterDefs = useMemo(() => publisherFilterDefs(auth, { ownData }), [auth, ownData]);
  const sorts = useMemo(
    () => entitySorts({ count: "credit_count", countLabel: "Credits", ownData }),
    [ownData],
  );
  const columns = useMemo(
    () => (ownData ? publisherColumns() : withoutPersonal(publisherColumns())),
    [ownData],
  );
  const rowPath = useCallback((p) => entityHref("publisher", p), [entityHref]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoints.publisher.list(), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load data");
        setAllPublishers(await res.json());
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
      title="Publishers"
      nouns={NOUNS}
      items={allPublishers}
      loading={loading}
      error={error}
      filterDefs={filterDefs}
      matchesSearch={matchesSearch}
      sorts={sorts}
      renderCard={(publisher) => (
        <PublisherCard key={publisher.system_id} publisher={publisher} />
      )}
      columns={columns}
      rowPath={rowPath}
    />
  );
}
