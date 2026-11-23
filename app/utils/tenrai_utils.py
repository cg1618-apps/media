"""
tenrai_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
Tenrai (MyAnimeList) API into the formats required by our Anime database model.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

ALLOWED_AIRING_TYPES = {"TV", "Movie", "ONA", "OVA", "Special"}

SEASON_MAP = {
    "winter": "WIN",
    "spring": "SPR",
    "summer": "SUM",
    "fall": "FAL",
}


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_airing_type(tenrai_type: Optional[str]) -> Optional[str]:
    """
    Converts Tenrai 'type' to our internal Airing Type.
    Falls back to 'Other' if the type is unrecognized.
    """
    if not tenrai_type:
        return None
    if tenrai_type in ALLOWED_AIRING_TYPES:
        return tenrai_type
    return "Other"


def _convert_airing_status(tenrai_status: Optional[str]) -> Optional[str]:
    """
    Normalizes Tenrai's specific phrasing into strict database terminology.
    """
    if not tenrai_status:
        return None

    lower_status = tenrai_status.lower()
    if "finished" in lower_status:
        return "Finished Airing"
    if "currently" in lower_status:
        return "Airing"
    if "not yet" in lower_status:
        return "Not Yet Aired"

    return None


def _film_release_status(airing_status: Optional[str]) -> Optional[str]:
    """
    A film's release status from MAL's airing status. A film is released
    once, so Airing and Finished Airing are both Released.
    """
    if airing_status in ("Airing", "Finished Airing"):
        return "Released"
    if airing_status == "Not Yet Aired":
        return "Not Released"
    return None


# MAL's type -> an anime movie's release_type. Any other MAL type says
# nothing about how a film was released, so it maps to nothing.
_FILM_RELEASE_TYPES = {"Movie": "Cinema", "ONA": "ONA"}


def _convert_season(tenrai_season: Optional[str]) -> Optional[str]:
    """
    Maps lowercase season strings to 3-letter uppercase abbreviations.
    """
    if not tenrai_season:
        return None
    return SEASON_MAP.get(tenrai_season.lower())


def _iso_from_prop(prop_part: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    A canonical release date from Tenrai's split `published.prop.from` / `.to`
    block, at whatever precision MAL actually knows.

    The sibling ISO timestamp (`published.from`) always carries a day, even when
    MAL only knows the year, so reading `prop` is what keeps us from inventing
    precision. Missing month or day simply stops the string early.
    """
    if not prop_part:
        return None

    year = prop_part.get("year")
    if not year:
        return None

    month = prop_part.get("month")
    if not month:
        return f"{int(year):04d}"

    day = prop_part.get("day")
    if not day:
        return f"{int(year):04d}-{int(month):02d}"

    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def _extract_external_links(
    external_links: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Iterates through the API's external links array.
    Safely extracts the Official Site and the first Twitter/X URL found.
    """
    official_link = None
    twitter_link = None

    for link in external_links:
        url = link.get("url", "")
        name = link.get("name", "").lower()

        if "official" in name and not official_link:
            official_link = url

        if ("twitter.com" in url or "x.com" in url) and not twitter_link:
            twitter_link = url

    return official_link, twitter_link


def _aired_release_date(aired: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    A canonical release date from Tenrai's `aired` block, at the precision MAL
    actually knows.

    `aired.from` and `aired.prop.from` are both padded: an anime MAL knows only
    the year for still arrives as "2026-01-01T00:00:00+00:00" with
    `prop.from = {day: 1, month: 1, year: 2026}`. Reading either alone would
    record a false 1 January every time. `aired.string` is the honest signal,
    because MAL renders exactly what it knows:

        "Jul 6, 2026 to Sep 28, 2026"  -> day known
        "Jul 2026 to ?"                -> month known, day not
        "2026 to ?"                    -> year only

    So the string decides the precision and `prop` supplies the numbers.
    """
    aired = aired or {}
    prop_from = (aired.get("prop") or {}).get("from") or {}
    year = prop_from.get("year")
    if not year:
        return None

    text = (aired.get("string") or "").strip()
    month = prop_from.get("month")
    day = prop_from.get("day")

    # "Jul 6, 2026 ..." — a month name followed by a day number.
    if month and day and re.match(r"^[A-Za-z]{3,} \d{1,2},", text):
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    # "Jul 2026 ..." — a month name with no day.
    if month and re.match(r"^[A-Za-z]{3,} \d{4}", text):
        return f"{int(year):04d}-{int(month):02d}"

    return f"{int(year):04d}"


# MAL lists a normal TV episode at anything from 22 to 26 minutes - the same
# half-hour slot, measured with or without its recap, preview and credits
# (sampled: 23 for Kimetsu no Yaiba and Naruto, 25 for Bakemonogatari, 26 for
# Angel Beats!). A duration inside this band, inclusive, is stored as
# TV_EPISODE_MINUTES so those entries read alike; one outside it is stored as
# MAL gives it. A Movie skips the band: a film's length is its own, not a TV
# slot, so MAL's minutes are kept. Autofill only: a runtime typed by hand is
# stored as typed.
TV_EPISODE_BAND = (22, 26)
TV_EPISODE_MINUTES = 24

_DURATION_PART = re.compile(r"(\d+)\s*(hr|min|sec)")
_DURATION_SECONDS = {"hr": 3600, "min": 60, "sec": 1}


def parse_mal_duration_minutes(text: Optional[str]) -> Optional[int]:
    """
    Whole minutes from MAL's duration string, or None when it names none.

    The shapes MAL uses: "24 min per ep", "24 min", "1 hr 46 min", "2 hr",
    "1 min 31 sec per ep", "30 sec", "Unknown". Rounded half up, and never
    below one minute for a duration that has any length at all.
    """
    if not text:
        return None
    seconds = sum(
        int(amount) * _DURATION_SECONDS[unit]
        for amount, unit in _DURATION_PART.findall(str(text))
    )
    if seconds <= 0:
        return None
    return max(1, (seconds + 30) // 60)


def anime_runtime_min(duration: Optional[str], airing_type: Optional[str]) -> Optional[int]:
    """
    The anime's runtime_min from MAL's duration: the TV band applied, except
    on a Movie, which keeps MAL's minutes.
    """
    minutes = parse_mal_duration_minutes(duration)
    if minutes is None or airing_type == "Movie":
        return minutes
    low, high = TV_EPISODE_BAND
    return TV_EPISODE_MINUTES if low <= minutes <= high else minutes


def anime_release_date_tw(date: Optional[str], airing_type: Optional[str]) -> Optional[str]:
    """
    The TW release date MAL's date stands for: the JP date itself, except on
    a Movie, whose Taiwanese release is a separate date MAL does not know.
    """
    return None if airing_type == "Movie" else date


# ==========================================
# MASTER ORCHESTRATOR
# ==========================================


def map_tenrai_to_anime_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Master orchestration function to parse raw Tenrai JSON data and flatten it
    into the standardized dictionary format expected by PostgreSQL.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))

    release_date = _aired_release_date(raw_data.get("aired"))
    release_season = _convert_season(raw_data.get("season"))

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    external_links = raw_data.get("external", [])
    official_link, twitter_link = _extract_external_links(external_links)

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "airing_type": airing_type,
        "airing_status": airing_status,
        "release_season": release_season,
        # The season is the JP date's; see _anime_fields in mal_prefill.py
        # and autofill_anime_from_mal for where TW is decided per entry.
        "release_date_jp": release_date,
        "release_date_tw": anime_release_date_tw(release_date, airing_type),
        "runtime_min": anime_runtime_min(raw_data.get("duration"), airing_type),
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "ep_total": raw_data.get("episodes"),
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }


def map_tenrai_to_anime_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw Tenrai JSON into the flat dict expected by AnimeMovies.
    Differs from map_tenrai_to_anime_data: no TW date, no runtime,
    release_status instead of airing_status, and no season fields.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    release_status = _film_release_status(
        _convert_airing_status(raw_data.get("status"))
    )

    release_date_jp = _aired_release_date(raw_data.get("aired"))

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    external_links = raw_data.get("external", [])
    official_link, twitter_link = _extract_external_links(external_links)

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "airing_type": airing_type,
        "release_type": _FILM_RELEASE_TYPES.get(airing_type),
        "release_status": release_status,
        "release_date_jp": release_date_jp,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "ep_total": raw_data.get("episodes"),
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }


def map_tenrai_to_manga_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Tenrai manga data dict into a flat dict for the Manga model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    prop = published.get("prop") or {}
    release_date = _iso_from_prop(prop.get("from"))
    end_date = _iso_from_prop(prop.get("to"))

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "serialization_status": serialization_status,
        "release_date": release_date,
        "end_date": end_date,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total": raw_data.get("volumes"),
        "ch_total": raw_data.get("chapters"),
        "cover_image_url": cover_image_url,
    }


def map_tenrai_to_book_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Tenrai manga data dict into a flat dict for the Book model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
        "Not yet published": "未出",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    prop = published.get("prop") or {}
    release_date = _iso_from_prop(prop.get("from"))
    end_date = _iso_from_prop(prop.get("to"))

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    volumes_raw = raw_data.get("volumes")
    vol_total_original = float(volumes_raw) if volumes_raw is not None else None

    chapters_raw = raw_data.get("chapters")
    ch_total = float(chapters_raw) if chapters_raw is not None else None

    return {
        "serialization_status": serialization_status,
        "release_date_jp": release_date,
        "end_date": end_date,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total_original": vol_total_original,
        "ch_total": ch_total,
        "cover_image_url": cover_image_url,
    }


# ==========================================
# STUDIOS (MAL "producers")
# ==========================================

# Hosts that answer /producers' `external` list but are never the studio's own
# site. MAL mixes the two freely and does not label which is which, so
# website_url is "the first link that is not one of these".
SOCIAL_HOSTS = (
    "twitter.com",
    "x.com",
    "youtube.com",
    "youtu.be",
    "instagram.com",
    "tiktok.com",
    "facebook.com",
)


def _producer_title(titles: List[Dict[str, Any]], wanted: str) -> Optional[str]:
    """The `titles` entry of one type, e.g. "Japanese"."""
    for entry in titles or []:
        if entry.get("type") == wanted and entry.get("title"):
            return entry["title"]
    return None


def _producer_website(external_links: List[Dict[str, Any]]) -> Optional[str]:
    """
    The studio's own site: the first http(s) `external` link whose host is not
    a social network. Unlike an anime's official_link there is no "Official"
    name to match on - a studio's site is listed under its own domain.
    """
    for link in external_links or []:
        url = link.get("url") or ""
        if not url.startswith("http"):
            continue
        if any(host in url.lower() for host in SOCIAL_HOSTS):
            continue
        return url
    return None


def _established_date(established: Optional[str]) -> Optional[str]:
    """
    The date half of Tenrai's `established` timestamp.

    Producers carry no `prop` block, so unlike an anime's `aired` there is no
    way to tell a real day from MAL's padding - "2011-06-14T00:00:00+00:00"
    becomes "2011-06-14" and a studio MAL knows only the year for is stored as
    that year's January 1st. Rare enough, and visible enough on the form, to
    beat guessing at precision the API does not report.
    """
    if not established or not isinstance(established, str):
        return None
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", established)
    return match.group(1) if match else None


def map_tenrai_to_studio_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms a raw Tenrai producer payload into the flat dict the Studio
    autofill writes from.

    Deliberately dropped: `about` (remark is the admin's own note, not MAL's
    blurb), `favorites` and `count` (no columns), and the Synonym title (it is
    usually the acronym expanded, not an alternative name worth storing).
    """
    return {
        "logo_url": raw_data.get("images", {}).get("jpg", {}).get("image_url"),
        "mal_link": raw_data.get("url"),
        "founded_date": _established_date(raw_data.get("established")),
        "name_jp": _producer_title(raw_data.get("titles", []), "Japanese"),
        "website_url": _producer_website(raw_data.get("external", [])),
    }


# MAL's stand-in for a person with no photo. Storing it would give every such
# seiyuu the same grey question mark in place of the SPA's own placeholder.
MAL_PLACEHOLDER_IMAGE_MARKER = "questionmark"


def _western_order(name: Optional[str]) -> Optional[str]:
    """
    "Hanazawa, Kana" -> "Kana Hanazawa". MAL lists a person family name
    first, separated by one ", "; anything else - a single-word stage name,
    or a name with more than one comma - is kept as MAL wrote it rather than
    guessed at.
    """
    if not name or not isinstance(name, str):
        return None
    name = name.strip()
    parts = name.split(", ")
    if len(parts) == 2 and all(p.strip() for p in parts):
        return f"{parts[1].strip()} {parts[0].strip()}"
    return name or None


# ==========================================
# TITLES AND CREDITS (the Add page's MAL prefill, and the MAL credit fill)
# ==========================================

# MAL's author `role` -> the credit roles it stands for. A role not listed
# here is dropped rather than guessed at.
MAL_AUTHOR_ROLES = {
    "Story": ("author",),
    "Art": ("illustrator",),
    "Story & Art": ("author", "illustrator"),
}


def _clean(value: Any) -> Optional[str]:
    """A stripped string, or None for a blank or a non-string."""
    if not isinstance(value, str):
        return None
    return value.strip() or None


def map_tenrai_titles(raw_data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """
    MAL's English and Japanese titles, and its synonyms comma-joined as the
    alternative name. The romaji `title` is the picker's. A synonym that is
    blank, repeated, or the same as one of the other three titles is dropped.
    """
    name_en = _clean(raw_data.get("title_english"))
    name_jp = _clean(raw_data.get("title_japanese"))
    taken = {name_en, name_jp, _clean(raw_data.get("title"))}
    synonyms = []
    for value in raw_data.get("title_synonyms") or []:
        synonym = _clean(value)
        if synonym and synonym not in taken and synonym not in synonyms:
            synonyms.append(synonym)
    return {
        "name_en": name_en,
        "name_jp": name_jp,
        "name_alt": ", ".join(synonyms) or None,
    }


def map_tenrai_studios(raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """An anime's `studios`, as {mal_id, name, url}; a nameless one is dropped."""
    out = []
    for studio in raw_data.get("studios") or []:
        name = _clean(studio.get("name"))
        if name:
            out.append(
                {"mal_id": studio.get("mal_id"), "name": name, "url": studio.get("url")}
            )
    return out


def map_tenrai_authors(raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    A manga's or book's `authors`, as {mal_id, name, name_mal, url, roles}.

    `name` is western order ("Eiichiro Oda"), the form a new person is
    created under; `name_mal` keeps MAL's "Oda, Eiichiro", which a hand-made
    row may hold instead. `roles` are credit roles: Story is the author,
    Art the illustrator, Story & Art both. An author whose role is none of
    those, or who has no name, is dropped.
    """
    out = []
    for author in raw_data.get("authors") or []:
        name_mal = _clean(author.get("name"))
        roles = MAL_AUTHOR_ROLES.get(_clean(author.get("role")) or "")
        if not name_mal or not roles:
            continue
        out.append(
            {
                "mal_id": author.get("mal_id"),
                "name": _western_order(name_mal),
                "name_mal": name_mal,
                "url": author.get("url"),
                "roles": list(roles),
            }
        )
    return out


def map_tenrai_credits(media_type: str, raw_data: Dict[str, Any]) -> Dict[str, list]:
    """
    {credit role: [MAL studio or author, ...]} for one media type, in MAL's
    order: studios for anime and anime movie, authors split by role for
    manga and book. Any other type credits nothing from MAL.
    """
    if media_type in ("anime", "anime-movie"):
        return {"studio": map_tenrai_studios(raw_data)}
    if media_type in ("manga", "book"):
        authors = map_tenrai_authors(raw_data)
        return {
            role: [a for a in authors if role in a["roles"]]
            for role in ("author", "illustrator")
        }
    return {}


def map_tenrai_to_person_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms a raw Tenrai people payload into the flat dict the person
    autofill writes from.

    Deliberately dropped: `birthday`, `website_url` and `about` - the person
    table has no columns for them, and the owner chose not to add any. The
    Japanese name is family then given with no space, as it is written.
    """
    photo_url = raw_data.get("images", {}).get("jpg", {}).get("image_url")
    if photo_url and MAL_PLACEHOLDER_IMAGE_MARKER in photo_url:
        photo_url = None
    name_jp = "".join(
        part.strip()
        for part in (raw_data.get("family_name"), raw_data.get("given_name"))
        if isinstance(part, str) and part.strip()
    )
    alternates = [
        a.strip()
        for a in raw_data.get("alternate_names") or []
        if isinstance(a, str) and a.strip()
    ]
    return {
        "photo_url": photo_url,
        "mal_link": raw_data.get("url"),
        "name_en": _western_order(raw_data.get("name")),
        "name_jp": name_jp or None,
        "name_alt": ", ".join(alternates) or None,
    }


def _mal_photo(raw_data: Dict[str, Any]) -> Optional[str]:
    """The jpg picture URL, or None for MAL's question-mark placeholder."""
    url = (raw_data.get("images") or {}).get("jpg", {}).get("image_url")
    if url and MAL_PLACEHOLDER_IMAGE_MARKER in url:
        return None
    return url


def map_tenrai_to_character_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms a raw Tenrai character payload into the flat dict the
    character autofill writes from. `about` is dropped: the character table
    has no column for it.
    """
    nicknames = [
        n.strip()
        for n in raw_data.get("nicknames") or []
        if isinstance(n, str) and n.strip()
    ]
    # MAL separates family and given name with a space ("安曇 美姫"); a
    # Japanese name is written without one, full-width spaces included.
    name_jp = raw_data.get("name_kanji")
    name_jp = "".join(name_jp.split()) if isinstance(name_jp, str) else ""
    return {
        "photo_url": _mal_photo(raw_data),
        "mal_link": raw_data.get("url"),
        "name_en": _western_order(raw_data.get("name")),
        "name_jp": name_jp or None,
        "name_alt": ", ".join(nicknames) or None,
    }


def _mal_cast_role(mal_role) -> str:
    """
    MAL's cast role, as one of CHARACTER_ROLES.

    MAL calls a character Main or Supporting. Main is kept; everyone else is
    filed as Other, Supporting included - MAL's Supporting is everyone who is
    not Main, so which of them earn Core, Important Supporting or Supporting
    is set by hand.
    """
    return "Main" if mal_role == "Main" else "Other"


def map_tenrai_cast(items: list) -> list[Dict[str, Any]]:
    """
    Transforms a Tenrai /anime|manga/{id}/characters list into cast rows:
    the character's MAL id, link, western-order name and picture, the role,
    and its Japanese voice actors - MAL lists every dub, and a casting
    records the original cast. An item with no character id is dropped.

    `name_mal` keeps the name as MAL wrote it ("Elric, Edward"): the
    western-order `name_en` cannot be turned back, and the cast import
    matches a hand-typed name in either order.
    """
    rows = []
    for item in items or []:
        character = item.get("character") or {}
        if not character.get("mal_id"):
            continue
        name = character.get("name")
        voices = [
            {
                "mal_id": (va.get("person") or {}).get("mal_id"),
                "mal_link": (va.get("person") or {}).get("url"),
                "name_en": _western_order((va.get("person") or {}).get("name")),
            }
            for va in item.get("voice_actors") or []
            if va.get("language") == "Japanese" and (va.get("person") or {}).get("mal_id")
        ]
        rows.append(
            {
                "mal_id": character["mal_id"],
                "mal_link": character.get("url"),
                "name_en": _western_order(name),
                "name_mal": (name.strip() or None) if isinstance(name, str) else None,
                "photo_url": _mal_photo(character),
                "role": _mal_cast_role(item.get("role")),
                "voices": voices,
            }
        )
    return rows
