# A person's gallery of works is library attachments

- **Library attachments, not a table of its own.** The pictures are `image` rows
  attached to the person (`staff`, role `work`), ordered by `position` and
  captioned by `image_attachment.caption`. Rejected: a `person_work_image` table,
  whose one gain was a cascade on delete; it would have been a second record of
  which images are in use, so the `unused` filter, the 409 on deleting a used
  image and the checksum dedup would each have needed teaching. The missing
  foreign key is paid for where it bites: deleting a person empties the gallery
  explicitly, and a merge moves it.
- **Removing a gallery picture deletes its file**, unlike detaching a cover
  upload, which is library stock kept for reuse — unless the same bytes are
  another owner's picture.
- **Writes are `manage.images`**, the key every upload and attach answers to.
- **Only an author or illustrator may gain a picture.** Losing the role later
  keeps the gallery rather than deleting someone's uploads as a side effect of a
  role edit. A viewer who cannot see any such role reads an empty gallery.
- **It does not travel on the sheet**, as no library row does.
- **No lightbox**: the tile links to the full picture in a new tab.
