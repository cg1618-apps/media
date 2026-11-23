# Entry covers are copied into the library

The image picker's library modal can take an entry's cover: its **From an
entry** tab searches entries by title, and a pick calls
`POST /api/images/from-entry`, which imports the entry's stored cover file
into the library exactly as an upload of that file would be (re-encoded,
`library/<checksum>.jpg`, thumbnail, deduplicated by checksum) and returns the
image row. The picker then attaches that row the normal way.

A downloaded cover is only a file at `covers/<owner_type>/<id>.jpg` plus the
key in the entry's `cover_image_file`, usually with no `image` row, so it
cannot be attached as it is. A copy makes it an ordinary library image.

## What the copy costs, and why it is accepted

- **A copy is not gated by content labels.** A library image is served from
  the unauthenticated `/static/library/` mount (unguessable, not guarded —
  see `authorization.md`), while a cover is served by `/api/covers/`, which
  hides a labelled entry's picture. So a cover copied from a labelled entry
  is shown wherever its new owner is, to anyone who can see that owner. The
  copy needs `manage.images` and an entry the caller can see, so only someone
  allowed to see the picture can make one; what it is used for afterwards is
  their choice.
- **A copy is independent.** Re-downloading, removing or deleting the source
  entry's cover never reaches it, and it never reaches the source. That is
  the point: the new owner's picture stays put.

## Rejected

- **Referencing the entry's key** (writing the source's `cover_image_file`
  into the new owner's column). There is no `image` row to attach, so the
  write would skip `image_attachment`: an owner with an existing attachment
  would keep a stale one, and detaching or force-deleting that image later
  would empty the column holding the reference. Book units never save a key
  from a form (the image library writes their cover), quote and meme keys
  resolve against a different root, and the shared file is overwritten by the
  source's next download and deleted by its Remove or its deletion, under
  every owner that points at it.
- **Giving the downloaded cover an `image` row on demand** and attaching that.
  The row's storage key would be the source entry's own file, so deleting it
  from `/images` would delete the source entry's cover — the aliasing that
  `image_library.drop_if_unused_download` exists to prevent.
