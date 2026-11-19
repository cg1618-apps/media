# Entry URLs are a per-type sequential id plus a decorative slug

- **`/<type>/<public_id>/<slug>`** — a stored per-type sequential integer, with
  the slug decorative and lookup on the id alone. It is the standard shape when
  the primary key is a UUID, and what MyAnimeList, TMDB and IMDb do.
- **Rejected: a truncated UUID.** No migration, but it reads as a UUID that got
  cut off.
- **Rejected: a random short code.** Those are the convention where the URL *is*
  the access control. Here permissions and content labels decide visibility,
  and a hidden entry and a nonexistent one answer the same 404, so enumeration
  reveals nothing the library page does not.
- **The accepted cost:** `public_id` leaks collection size and creation order,
  which for a personal collection is not a secret worth uglier URLs. Deletions
  leave permanent gaps; ids are never reused.
- The slug derives from a **Latin-first** name chain, independent of the
  CN-first display name.
