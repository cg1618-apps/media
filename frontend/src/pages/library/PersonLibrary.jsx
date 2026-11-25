// Frontend: page component file for PersonLibrary.
//
// People are a public entity, not a media type — this sits at /library/person
// as a standalone component, outside LIBRARY_CONFIGS, drawn by the
// EntityLibrary the other entity libraries share. The filters are entry type,
// the person type (the admin sub-tabs' vocabulary, named in Chinese and
// matched against the `roles` each person carries), gender and rating. A
// seiyuu is a person like any other, found under the Type group's 聲優; a
// seiyuu never yet cast is listed by default under No entries.
import { useCallback, useEffect, useMemo, useState } from "react";

import { PersonCard } from "../../components/cards/StaffCard";
import EntityLibrary from "../../components/layout/EntityLibrary";
import { personColumns } from "../../components/layout/entityColumns";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { personFilterDefs } from "../../lib/entityFilters";
import { useEntityHref } from "../../lib/entityPath";
import { withoutPersonal } from "../../lib/libraryScope";
import { PERSON_NAME_FIELDS } from "../../lib/naming";
import { cleanString } from "../../utils/media";
import { entitySorts } from "../../lib/entitySorts";

const NOUNS = { one: "person", many: "people" };

// Searches all four name fields, not just the displayed one: someone looking
// a person up by their Japanese name must find them even when English is the
// configured display name.
function matchesSearch(person, q) {
  return PERSON_NAME_FIELDS.some(
    ({ field }) => person[field] && cleanString(person[field]).includes(q),
  );
}

export default function PersonLibrary() {
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const auth = useAuth();
  // My rating is the viewer's own (self.list): without the key there is no
  // rating sort, filter or column at all.
  const { ownData } = useViewScope();
  const entityHref = useEntityHref();
  const filterDefs = useMemo(() => personFilterDefs(auth, { ownData }), [auth, ownData]);
  const sorts = useMemo(
    () => entitySorts({ count: "credit_count", countLabel: "Credits", ownData }),
    [ownData],
  );
  const columns = useMemo(
    () => (ownData ? personColumns() : withoutPersonal(personColumns())),
    [ownData],
  );
  const rowPath = useCallback((p) => entityHref("person", p), [entityHref]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoints.person.list(""), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load data");
        setAllPeople(await res.json());
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
      title="People"
      nouns={NOUNS}
      items={allPeople}
      loading={loading}
      error={error}
      filterDefs={filterDefs}
      matchesSearch={matchesSearch}
      sorts={sorts}
      renderCard={(person) => <PersonCard key={person.system_id} person={person} />}
      columns={columns}
      rowPath={rowPath}
    />
  );
}
