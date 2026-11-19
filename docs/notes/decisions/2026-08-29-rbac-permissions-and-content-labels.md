# Role-based permissions, and content labels in their own table

The behaviour is `authorization.md`; this is why it has this shape.

- **RBAC, not tiers.** Permissions are a registry in code and grants are rows in
  the database, so a role's reach is data while what a permission *means* stays
  reviewable in code.
- **Labels never name roles,** and they live in a dedicated label table rather
  than in `media_tag`, because the pipelines write `media_tag` and a pipeline
  must never be able to change who may see an entry.
- **The JWT carries `sub` only.** Permissions are resolved per request, so a
  changed grant takes effect without a new login.
- **Resolving the viewer never raises; it fails closed to the guest.** A broken
  cookie degrades to the public view rather than to an error page.
- **Field gating works on a copy of the row, never by `setattr` on a live ORM
  object,** which the session would otherwise flush back to the database.
- **A hidden entry is missing (404), not forbidden.** See "Two axes: role and
  access mode" for the 401/404 rule as it stands.
