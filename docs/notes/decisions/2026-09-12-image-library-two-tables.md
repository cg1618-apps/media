# Uploaded images are a two-table library, content-addressed

- **An `image` blob table and a polymorphic `image_attachment` join, not a
  file path per row** — the shape ActiveStorage, WordPress and Django land on.
  When the path *is* the identity (`anime/<id>.jpg`), one image per row is a
  structural limit, and replacing an image serves the old one from browser
  cache because the URL does not change. Content-addressed storage makes a
  replaced image a new key, so that bug cannot be written.
- **`owner_id` is deliberately not a foreign key**: there is no single table to
  point at. Nothing in the database stops an attachment outliving its owner;
  the `unused` filter and the orphan tooling find those. Rejected: a nullable
  foreign key per owner table, which is worse in every other respect.
- **The re-encode to JPEG is the security control, not a format preference.**
  Validation is ordered, each step assuming the last passed, and the size cap
  is checked **before the body is read** — `Content-Length` is a claim from
  the client and cannot be the only check.
- **Identical pixels dedup; "the same picture" does not.** JPEG is lossy, so a
  PNG and a JPEG of one picture decode to different pixels and cannot
  re-encode to identical bytes.
- **The storage root is `static/library/`, not under `static/covers/`.**
  Uploaded images are library images, not covers.
- **Uploaded images never travel through Backup or Pull**, and the bulk cover
  download skips them; `uploaded_by` is what tells an upload from a download.
