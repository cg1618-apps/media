# Novel becomes Book

Working spec for the to-do-next item "Novel becomes Book". Deleted when the
branch lands; what survives goes to `docs/notes/decisions.md` and the
present-tense pages.

## Decided

From `docs/to-do-next.md` (owner) plus the owner's answers of 2026-11-17:

- The type is renamed **throughout**: table, `media_type` value, route, registry
  and SPA keys, franchise type, sheet tabs, unit and rating tables, columns.
- Type vocabulary becomes `輕小說`, `小說`, `網路小說`, `短篇集`, `指南/設定集`,
  `其他`; migration maps `Light Novel`→`輕小說`, `Novel`→`小說`, `Web`→`網路小說`,
  `Other`→`其他`. The owner moves entries to `短篇集` / `指南/設定集` by hand.
- Statistics keeps a **Novel** section counting `輕小說`, `小說`, `網路小說`,
  `短篇集` only.
- `release_date` → `release_date_jp`, new `release_date_tw`; `end_date` stays.
- **Old URLs redirect**: `/novel/:publicId/:slug?` → `/book/...`,
  `/library/novel` → `/library/book`.
- **Covers move on disk**: `static/covers/novel/` and `static/covers/thumbs/novel/`
  → `book/`. The migration rewrites stored paths; the app copies the files itself
  at startup when the old folder exists (idempotent; never overwrites). A copy,
  not a move, so a rolled-back release still finds its covers; the old folder
  is deleted by hand once the release has proved itself (open-items.md).
- **Hentai source material `Novel` stays** — it names the genre adapted from.
- Genre prose stays (light novel, web novel, visual novel, graphic novel), as do
  MAL/AniList vocabulary and every historical alembic revision.

## Decided here (precedent)

- **The favourite grid's stored key `Novel` in `franchise.type_slots` stays**, as
  the ACG split left `ACG` (`a1n2imanga4`, `favoriteGrids.js`). Only its title
  and the `forType` change.
- **`deleted_record` tombstones are not rewritten** (ACG precedent); the readers
  that branch on the label accept both `Novel` and `Book`.
- `type_covers` keys `Novel` → `Book` are rewritten (ACG precedent).

## Migration (one revision, after `p1r2ogfloat3`)

1. Tables: `novel`→`book`, `novel_unit`→`book_unit`,
   `user_novel_unit_rating`→`user_book_unit_rating`; column `novel_id`→`book_id`,
   `novel_name_{en,cn,roman,jp,alt}`→`book_name_*`, `release_date`→`release_date_jp`,
   add `release_date_tw`.
2. Every named object: pkeys, fkeys, indexes, checks (`ck_novel_media_type` swapped
   to `'book'`), `novel_public_id_seq`, trigger `trg_novel_delete_media`
   (names built by `media_sync.py`). The drift test proves the result equals
   `create_all`.
3. Values: `media.media_type`, `book.media_type` server default, `plan_next.media_type`
   (drop/recreate the non-deferrable `fk_plan_next_media_type` around it),
   `role_permission` `media_type.novel`, `image_attachment.owner_type`, scope
   tables, `character_casting.media_type`, `user_request.target_type`,
   `franchise.franchise_type` token, `type_covers` keys, `system_configs`
   `form_defaults:novel` / `random_picker_defaults:novel` (key and the field
   names and type values inside), `media.cover_image_file` / `image.storage_key`
   `novel/` prefixes, `book.type` vocabulary, and the remark/note `owner_type`.
4. Downgrade reverses every step (vocabulary maps back; `短篇集`/`指南/設定集`
   go to `Other`; `release_date_tw` is dropped).

## Pull of an older sheet

Tab aliases (new mechanism): `Novel`→`Book`, `Novel Unit`→`Book Unit`,
`User Novel Unit Rating`→`User Book Unit Rating`. `RENAMED_COLUMNS` for
`novel_id`, `novel_name_*`, `release_date`. Cell values `novel`/`Novel` in the
type, scope and owner columns of Media, User Media List, Plan Next, Character
Casting, Person Role, Publisher Scope, System Option Scope, System Configs and
Franchise are mapped, as is the old type vocabulary.

## Build order

1. Backend + migration + Pull + tests (one commit).
2. Frontend: file and key renames, routes and redirects, vocabulary, JP/TW dates,
   statistics filter (one commit).
3. Docs: every page naming novel, decisions.md, delete the to-do item.

## The contract between backend and frontend

Both halves are built against exactly these names:

- Media-type key, owner type and registry key `book`; label `Book`; permission
  `media_type.book`; search results key `book`; note, image and scope owner `book`.
- Routes: `/api/book` (CRUD), `/api/book/search-mal`, `/api/book/search-openlibrary`,
  `/api/book/mal-prefill/{id}`, `PUT /api/me/book-units/{unit_id}`,
  `/api/data-control/fill/book`, `/replace/book`, `/pull/book`.
- SPA: `/book/:publicId/:slug?`, `/library/book`, `/modify?...&type=book`;
  `/novel/...` and `/library/novel` redirect to them.
- Fields: `book_name_{en,cn,roman,jp,alt}`; units `book_unit` with `book_id`;
  `release_date_jp`, `release_date_tw`, `end_date`.
- `/api/constants` option keys `book_region`, `book_type`,
  `book_serialization_status`.
- `book.type` values: `輕小說`, `小說`, `網路小說`, `短篇集`, `指南/設定集`, `其他`.
  The unit kinds by type follow the old mapping (`輕小說` and `小說` are
  volume-only as `Light Novel` and `Novel` were; `網路小說` as `Web`;
  `其他` as `Other`); `短篇集` and `指南/設定集` take `其他`'s rules.
- Franchise type `Book`; `type_covers` key `Book`; the favourite grid's stored
  key stays `Novel`.
- Sheet tabs `Book`, `Book Unit`, `User Book Unit Rating`; pipeline label `Book`.
- Covers under `static/covers/book/` and `static/covers/thumbs/book/`; stored
  paths `book/<file>`.
- Statistics: the section is labelled **Novel** and counts books whose `type`
  is `輕小說`, `小說`, `網路小說` or `短篇集`.
