# One polymorphic note table and a section registry

Notes are rows in one `note` table, and what each section holds is declared in
a backend registry, `app/utils/note_sections.py`, rather than in a JSONB column
on each owner.

- **Rejected: a table per note shape.** Every new shape would be a migration,
  and every owner a new set of joins.
- **Rejected: JSONB on the owner with a schema enforced in the backend.** The
  database enforces nothing inside it, and every edit rewrites the whole
  document.
- **Similar keys across media types are kept distinct on purpose.** A section
  that looks the same on two types is still two sections, so one can change
  without dragging the other.
- A value that violates its section's shape is refused with 422.
