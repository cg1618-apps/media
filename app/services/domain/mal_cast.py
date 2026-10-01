"""
Build an entry's cast from MyAnimeList, via Tenrai, for the cast editor.

`mal_cast_rows` answers the editor's "Import from MAL": it reads the MAL
entry's characters, finds or creates the local character and seiyuu each one
names, and returns cast rows in the shape GET /api/casting returns - which the
editor appends to its form exactly as it appends a franchise sibling's cast.
The cast itself is NOT written: the rows are saved by the editor's ordinary
PUT, after the admin has reviewed them. Only the characters and people it had
to mint are written here, the same way the editor's own comboboxes mint one
the moment it is picked.

Matching:
- a character by `character.mal_id`, never by name (Decision G: names recur
  across unrelated works, so a name match could fuse two characters);
- a seiyuu by `person.mal_id`, then by name through resolve_person, the same
  find-or-create every other person field uses - a human's name is nearly
  unique, and splitting one voice actor across two rows would split their
  whole body of work.
Only MAL's Japanese voice actors are taken: a casting records the original
cast.
"""

import logging

from sqlalchemy.orm import Session

from app import models
from app.services.domain.casting import CASTING_MEDIA_TYPES, VOICED_MEDIA_TYPES
from app.services.domain.credits import (
    AmbiguousNameError,
    find_person,
    resolve_person,
)
from app.services.integrations.image_manager import cover_key, download_cover_image
from app.services.integrations.tenrai import fetch_tenrai_cast
from app.services.rbac.shared_visibility import apply_shared_visibility
from app.utils.tenrai_utils import map_tenrai_cast
from app.utils.utils import extract_mal_id_anime, extract_mal_id_manga_novel

logger = logging.getLogger(__name__)


class MalCastError(ValueError):
    """The request is wrong: an unknown media type or not a MAL link."""


class MalCastUnavailable(RuntimeError):
    """MAL, through Tenrai, answered with no cast for the entry."""


def _mal_resource(media_type: str, mal_link: str) -> tuple[str, int]:
    """("anime" | "manga", mal_id) for this media type's MAL link."""
    if media_type not in CASTING_MEDIA_TYPES:
        raise MalCastError(f"Unknown casting media type: {media_type}")
    if media_type in VOICED_MEDIA_TYPES:
        resource, mal_id = "anime", extract_mal_id_anime(mal_link)
    else:
        resource, mal_id = "manga", extract_mal_id_manga_novel(mal_link)
    if not mal_id:
        raise MalCastError(f"Not a MyAnimeList {resource} link: {mal_link!r}")
    return resource, mal_id


def _characters_for(
    db: Session, viewer, rows: list[dict], portraits: list[tuple[str, str]]
) -> tuple[dict, int]:
    """
    {mal_id: Character} for every MAL character in `rows`, minting the ones
    this database lacks. A character the viewer cannot see is not matched -
    reusing it would put a hidden record's name in the viewer's form - so a
    new one is minted, which the merge endpoint can fold later.

    A minted character's portrait is not downloaded here: a long cast is a
    hundred pictures, minutes of a request. Its photo_file is set to the key
    the download will write, and (url, system_id) is appended to `portraits`
    for download_portraits to fetch after the response. Until it lands - or
    if it fails - the key names a missing own download, which
    cover_needs_download treats as needing one, so the next MAL fill of that
    character repairs it.
    """
    wanted = {row["mal_id"] for row in rows}
    found: dict[int, models.Character] = {}
    query = apply_shared_visibility(
        db.query(models.Character).filter(models.Character.mal_id.in_(wanted)),
        models.Character,
        db,
        viewer,
    )
    for character in query.order_by(models.Character.public_id):
        found.setdefault(character.mal_id, character)

    created = 0
    for row in rows:
        if row["mal_id"] in found or not row["name_en"]:
            continue
        character = models.Character(
            name_en=row["name_en"], mal_id=row["mal_id"], mal_link=row["mal_link"]
        )
        db.add(character)
        db.flush()
        if row["photo_url"]:
            character.photo_file = cover_key("character", str(character.system_id))
            portraits.append((row["photo_url"], str(character.system_id)))
        found[row["mal_id"]] = character
        created += 1
    return found, created


def _seiyuu_for(
    db: Session, media_type: str, rows: list[dict], warnings: list[str]
) -> tuple[dict, int]:
    """
    {mal_id: Person} for every Japanese voice in `rows`, each holding the
    seiyuu role for `media_type` so the editor's seiyuu list offers them.
    """
    voices = {v["mal_id"]: v for row in rows for v in row["voices"]}
    if not voices:
        return {}, 0
    found = {
        p.mal_id: p
        for p in db.query(models.Person).filter(models.Person.mal_id.in_(voices))
    }
    created = 0
    for mal_id, voice in voices.items():
        person = found.get(mal_id)
        if person is None:
            if not voice["name_en"]:
                continue
            try:
                existed = find_person(db, voice["name_en"]) is not None
                person = resolve_person(
                    db, voice["name_en"], role="seiyuu", scope=media_type
                )
            except AmbiguousNameError:
                warnings.append(
                    f"{voice['name_en']} matches more than one person; "
                    "pick the right one by hand."
                )
                continue
            created += 0 if existed else 1
            if not person.mal_id:
                person.mal_id = mal_id
                person.mal_link = person.mal_link or voice["mal_link"]
            found[mal_id] = person
        elif not any(
            r.role == "seiyuu" and r.scope == media_type for r in person.roles
        ):
            db.add(
                models.PersonRole(
                    person_id=person.system_id, role="seiyuu", scope=media_type
                )
            )
    db.flush()
    return found, created


def download_portraits(portraits: list[tuple[str, str]]) -> None:
    """Fetch the portraits mal_cast_rows deferred. Run after the response."""
    for url, system_id in portraits:
        download_cover_image(url, "character", system_id)


def mal_cast_rows(
    db: Session, viewer, media_type: str, mal_link: str
) -> tuple[dict, list[tuple[str, str]]]:
    """
    ({cast, created_characters, created_people, warnings}, portraits) for one
    MAL entry, the cast in MAL's order; `portraits` is for
    download_portraits. Raises MalCastError for a bad link and
    MalCastUnavailable when MAL answers with no cast. Does not commit. Skipping characters the form already holds
    is the editor's business, as it is for a franchise import.
    """
    resource, mal_id = _mal_resource(media_type, mal_link)
    items = fetch_tenrai_cast(resource, mal_id)
    if not items:
        raise MalCastUnavailable("MyAnimeList returned no cast for this entry.")
    rows = map_tenrai_cast(items)
    if media_type not in VOICED_MEDIA_TYPES:
        for row in rows:
            row["voices"] = []

    warnings: list[str] = []
    portraits: list[tuple[str, str]] = []
    characters, created_characters = _characters_for(db, viewer, rows, portraits)
    people, created_people = _seiyuu_for(db, media_type, rows, warnings)

    cast = []
    seen: set = set()
    for row in rows:
        character = characters.get(row["mal_id"])
        if character is None or character.system_id in seen:
            continue
        seen.add(character.system_id)
        # One person once per casting (uq_casting_voice), whatever MAL lists.
        voice_people = list(
            {
                people[v["mal_id"]].system_id: people[v["mal_id"]]
                for v in row["voices"]
                if v["mal_id"] in people
            }.values()
        )
        cast.append(
            {
                "character_id": str(character.system_id),
                "character_public_id": character.public_id,
                "character_name": character.display_name,
                "role": row["role"],
                "position": len(cast),
                "photo_file": None,
                "photo_focus": None,
                "remark": None,
                "voices": [
                    {
                        "person_id": str(person.system_id),
                        "person_public_id": person.public_id,
                        "person_name": person.display_name,
                        "remark": None,
                    }
                    for person in voice_people
                ],
            }
        )
    return {
        "cast": cast,
        "created_characters": created_characters,
        "created_people": created_people,
        "warnings": warnings,
    }, portraits
