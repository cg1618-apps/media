// Frontend: the people who belong to a studio (person_affiliation), on the
// studio's page.
//
// Read-only here: an affiliation is written from the person's side, in the
// person form's Affiliation field. GET /api/studio/{id}/people leaves out the
// people the viewer may not see, so this renders what it is given, and draws
// nothing at all when that is no one.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useEntityHref } from "../../lib/entityPath";
import { Slip } from "../ui/primitives";

const linkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

function PersonLink({ person }) {
  const entityHref = useEntityHref();
  const path = entityHref("person", person);
  return path ? (
    <Link to={path} className={linkCls}>
      {person.display_name}
    </Link>
  ) : (
    <span>{person.display_name}</span>
  );
}

export default function AffiliatedPeople({ studioId }) {
  const [people, setPeople] = useState([]);

  useEffect(() => {
    if (!studioId) return undefined;
    let cancelled = false;
    fetchJson(endpoints.studio.people(studioId))
      .then((rows) => !cancelled && setPeople(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  if (people.length === 0) return null;
  return (
    <Slip title="People">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm" aria-label="People">
        {people.map((p) => (
          <li key={p.system_id}>
            <PersonLink person={p} />
          </li>
        ))}
      </ul>
    </Slip>
  );
}
