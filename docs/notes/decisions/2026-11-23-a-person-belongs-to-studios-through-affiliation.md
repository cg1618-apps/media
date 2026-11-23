# A person belongs to studios through `person_affiliation`

A director works at a studio; a seiyuu belongs to an agency. The owner wanted
that as a field of the person, not as a relation: a person picks the studios
they belong to, and the studio's page lists its people.

- **A join table, one row per (person, studio).** A person may belong to
  several studios, and each end is a real FK, so deleting either drops the
  row. Belonging has a direction, so there is one row per pair and no remark
  per side - unlike `company_relation`.
- **Written with the person**, as `studio_ids` on the person's create and
  update, because the owner edits it in the person form. The studio page
  only reads it.
- **Rejected: making it a peer relation** between a person and a studio
  (`company_relation` with a person end). A peer relation is mutual and
  carries a remark per side, both written from either page; an affiliation
  is the person's fact, and "remark on the studio's side" has no meaning.
- **Rejected: reusing club membership** (`person_membership`). Both ends of a
  membership are people, a club being a person holding the `club` role; an
  agency is a studio, a company with its own page and credits.
- **Agencies are studios.** A seiyuu's agency is filed as a studio rather
  than in a separate agency table, since it is a company the catalogue may
  well credit, and one table of companies keeps a single page per company.
