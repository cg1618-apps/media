// Frontend: page component file for StudioLibrary.
//
// Studios are a public entity, not a media type — this sits at
// /library/studio as a standalone component, outside LIBRARY_CONFIGS, drawn by
// the EntityLibrary the other entity libraries share.
import { useCallback, useEffect, useMemo, useState } from "react";

import { StudioCard } from "../../components/cards/StaffCard";
import EntityLibrary from "../../components/layout/EntityLibrary";
import { studioColumns } from "../../components/layout/entityColumns";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { studioFilterDefs } from "../../lib/entityFilters";
import { useEntityHref } from "../../lib/entityPath";
import { entitySorts } from "../../lib/entitySorts";
import { withoutPersonal } from "../../lib/libraryScope";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { cleanString } from "../../utils/media";

const NOUNS = { one: "studio", many: "studios" };

function matchesSearch(studio, q) {
  return STUDIO_NAME_FIELDS.some(
    ({ field }) => studio[field] && cleanString(studio[field]).includes(q),
  );
}

export default function StudioLibrary() {
  const [allStudios, setAllStudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const auth = useAuth();
  // My rating is the viewer's own (self.list): without the key there is no
  // rating sort, filter or column at all.
  const { ownData } = useViewScope();
  const entityHref = useEntityHref();
  const filterDefs = useMemo(
    () => studioFilterDefs(auth, { ownData, studios: allStudios }),
    [auth, ownData, allStudios],
  );
  const sorts = useMemo(
    () => entitySorts({ count: "credit_count", countLabel: "Credits", ownData }),
    [ownData],
  );
  const columns = useMemo(
    () => (ownData ? studioColumns() : withoutPersonal(studioColumns())),
    [ownData],
  );
  const rowPath = useCallback((s) => entityHref("studio", s), [entityHref]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/studio/", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load data");
        setAllStudios(await res.json());
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
      title="Studios"
      nouns={NOUNS}
      items={allStudios}
      loading={loading}
      error={error}
      filterDefs={filterDefs}
      matchesSearch={matchesSearch}
      sorts={sorts}
      renderCard={(studio) => <StudioCard key={studio.system_id} studio={studio} />}
      columns={columns}
      rowPath={rowPath}
    />
  );
}
