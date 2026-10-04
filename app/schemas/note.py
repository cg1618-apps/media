"""Note request/response schemas, validated against the section registry."""

from datetime import datetime
from typing import List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import (
    FIELD_LINKS,
    FIELD_LIST,
    FIELD_NAMES,
    FIELD_SELECT,
    SHAPE_EPISODE_TEXT,
    SHAPE_MUSIC_STATUS,
    SHAPE_MUSIC_TRACK,
    SHAPE_NAME_ENTRIES,
    SHAPE_NAME_LINKS,
    SHAPE_STRUCTURED,
    STORED_SHAPES,
    NoteField,
    NoteSection,
    field_by_key,
    group_by_key,
    group_for,
    kinds_for,
    label_for,
    locator_for,
    section_by_key,
    sections_for,
    uses_link_pairs,
)


class LinkPair(BaseModel):
    """
    One link of a section whose links are text-and-URL pairs - the song lists
    (see note_sections.uses_link_pairs). `text` is the label shown
    for the link (YouTube, Spotify, ...), suggested from the "Song Source"
    option category but free; `url` is required, which validate_note_payload
    enforces so the error names the section.

    An unknown key is refused, so a typo'd `label` cannot be stored and then
    silently never shown.
    """

    model_config = ConfigDict(extra="forbid")

    text: Optional[str] = None
    url: str


class NoteBase(BaseModel):
    owner_type: Optional[str] = None
    owner_id: Optional[UUID] = None
    section: Optional[str] = None
    locator: Optional[str] = None
    kind: Optional[str] = None
    status: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    # URL strings everywhere except the sections whose links are pairs, where
    # each item is a LinkPair. Which of the two a section takes is the
    # registry's call (uses_link_pairs) and validate_note_payload refuses the
    # other, so one section never holds both.
    links: Optional[List[Union[str, LinkPair]]] = None
    # The name_entries shape's ordered items: each is
    # {"type": "text"|"link", "value": str, "label": str|None}. Kept apart from
    # `links`, which holds URL strings or text-and-URL pairs.
    entries: Optional[List[dict]] = None
    # The structured shape's non-column fields, keyed by NoteField.key. Checked
    # against the section's spec by validate_note_payload - an unknown key is
    # refused rather than stored, so the blob cannot drift from the registry.
    fields: Optional[dict] = None
    # The row this one nests under, for `hierarchical` sections. The router
    # owns the rules a schema cannot check: that the parent exists, shares this
    # row's owner and section, and is not the row itself.
    parent_id: Optional[UUID] = None
    sort_index: Optional[float] = None


class NoteCreate(NoteBase):
    pass


class NoteUpdate(NoteBase):
    pass


class NoteResponse(NoteBase):
    system_id: UUID
    # Read-only. Set from the request's viewer, never from the payload, which
    # is why it is on the response schema and not on NoteBase.
    author_id: Optional[UUID] = None
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NoteFieldOut(BaseModel):
    """One field of a structured section, as the frontend needs it.

    `column` is deliberately included. The page does not choose where a field
    is stored - the registry does - but it has to send the value back under
    the right key, and a field naming a column goes at the top level of the
    payload while one naming none goes inside `fields`.
    """

    key: str
    label: str
    type: str
    column: Optional[str] = None
    options: List[str] = []
    required: bool = False
    # What a new row starts this field on; the page seeds its draft with it.
    default: Optional[str] = None
    quick_edit: bool = False
    placeholder: Optional[str] = None
    # Populated for `list` fields alone: the shape of one nested row.
    item_fields: List["NoteFieldOut"] = []


class NoteSectionOut(BaseModel):
    """One registry entry as the frontend needs it, resolved for one owner."""

    key: str
    shape: str
    # "catalog" or "personal"; None for the external sections, which are backed
    # by their own tables. The frontend does not act on this yet - the profile
    # UI that will is deferred with the rest of the authorization redesign.
    scope: Optional[str] = None
    label: str
    # The group card this section renders inside, resolved for the frontend so
    # the page never has to know what a group key means. None renders flat.
    group: Optional[str] = None
    group_label: Optional[str] = None
    group_icon: Optional[str] = None
    # Render as its own top-level card rather than inside the Notes card.
    # Mutually exclusive with `group`, which is the same lift plus a shared card.
    standalone: bool = False
    kinds: List[str] = []
    default_kind: Optional[str] = None
    statuses: List[str] = []
    locator_placeholder: Optional[str] = None
    locator_required: bool = False
    # An episode_text section whose rows also carry URL links (OP/ED 變動).
    takes_links: bool = False
    singleton: bool = False
    desc_required: bool = False
    # Empty for every shape but `structured`, which is entirely described by it.
    fields: List[NoteFieldOut] = []
    # Field-key groups where the row must fill at least one.
    require_any: List[List[str]] = []
    # Rows may carry a parent_id and render as a tree.
    hierarchical: bool = False
    # The key of a `names` field the read view draws one group per name of.
    # None renders the rows flat.
    group_by: Optional[str] = None
    # The key of a `select` field the reader may toggle a one-group-per-value
    # view on. None offers no toggle.
    groupable_by: Optional[str] = None
    # Owner-entry columns the section is limited to, {column: [values]}. The
    # page renders no card on an owner outside them; the API refuses a row.
    owner_where: dict[str, List[str]] = {}
    # Whether `links` holds {"text", "url"} pairs rather than URL strings.
    link_pairs: bool = False
    # The system_option category suggesting a link pair's `text`. None offers
    # no suggestions.
    link_text_category: Optional[str] = None
    # `kind` is free text suggested from this system_option category (the
    # Song Type of an OP or ED). Set only where `kinds` is empty.
    kind_category: Optional[str] = None
    # What a new row's `status` starts on.
    default_status: Optional[str] = None
    # At most one row per (owner, kind); a second is refused with a 422.
    one_per_kind: bool = False
    # Not rendered as a card: its rows belong to the sections pointing at it.
    hidden: bool = False
    # The section holding this section's list-level status, in the row whose
    # `kind` is this section's key - and that status's vocabulary and default,
    # resolved here so the page can draw the status bar from this endpoint
    # alone. None and empty where the section has no list-level status.
    type_status_section: Optional[str] = None
    type_statuses: List[str] = []
    type_status_default: Optional[str] = None


class NoteReorder(BaseModel):
    """New ordering for one section of one owner."""

    owner_type: str
    owner_id: UUID
    section: str
    ordered_ids: List[UUID]


def field_out(field: NoteField) -> NoteFieldOut:
    """Resolve one field spec, recursing into a list field's row shape."""
    return NoteFieldOut(
        key=field.key,
        label=field.label,
        type=field.type,
        column=field.column,
        options=list(field.options),
        required=field.required,
        default=field.default,
        quick_edit=field.quick_edit,
        placeholder=field.placeholder,
        item_fields=[field_out(f) for f in field.item_fields],
    )


def section_out(section: NoteSection, owner_type: str) -> NoteSectionOut:
    """Resolve a registry entry for one owner type."""
    group = group_by_key(group_for(section, owner_type) or "")
    type_status = section_by_key(section.type_status_section or "")
    return NoteSectionOut(
        key=section.key,
        shape=section.shape,
        scope=section.scope,
        label=label_for(section, owner_type),
        group=group.key if group else None,
        group_label=group.label if group else None,
        group_icon=group.icon if group else None,
        standalone=section.standalone,
        kinds=list(kinds_for(section, owner_type)),
        default_kind=section.default_kind,
        statuses=list(section.statuses),
        locator_placeholder=locator_for(section, owner_type),
        locator_required=section.locator_required,
        takes_links=section.takes_links,
        singleton=section.singleton,
        desc_required=owner_type in section.desc_required,
        fields=[field_out(f) for f in section.fields],
        require_any=[list(group) for group in section.require_any],
        hierarchical=section.hierarchical,
        group_by=section.group_by,
        groupable_by=section.groupable_by,
        owner_where={k: list(v) for k, v in section.owner_where.items()},
        link_pairs=uses_link_pairs(section),
        link_text_category=section.link_text_category,
        kind_category=section.kind_category,
        default_status=section.default_status,
        one_per_kind=section.one_per_kind,
        hidden=section.hidden,
        type_status_section=type_status.key if type_status else None,
        type_statuses=list(type_status.statuses) if type_status else [],
        type_status_default=type_status.default_status if type_status else None,
    )


def sections_out(owner_type: str) -> List[NoteSectionOut]:
    """The whole registry for one owner type, in display order."""
    return [section_out(s, owner_type) for s in sections_for(owner_type)]


def _field_value(field: NoteField, payload: NoteBase):
    """This field's submitted value, from its column or from `fields`."""
    if field.column:
        return getattr(payload, field.column, None)
    return (payload.fields or {}).get(field.key)


def _is_blank(value) -> bool:
    """Whether a submitted field value counts as unfilled."""
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return not value
    return False


def _check_link_pairs(links, where: str) -> None:
    """Every item a text-and-URL pair, and every pair carrying a URL."""
    if not isinstance(links, list) or not all(
        isinstance(link, LinkPair) for link in links
    ):
        raise ValueError(f"{where} must be text-and-URL pairs.")
    for i, link in enumerate(links, start=1):
        if not link.url.strip():
            raise ValueError(f"{where} link {i} needs a URL.")


def _check_links(section: NoteSection, links) -> None:
    """
    A non-structured section's links, in the one shape its registry entry
    takes: pairs where uses_link_pairs says so, URL strings everywhere else.
    A structured section checks its links field by field instead.
    """
    if not links:
        return
    where = f"Section '{section.key}' links"
    if uses_link_pairs(section):
        _check_link_pairs(links, where)
    elif not all(isinstance(link, str) for link in links):
        raise ValueError(f"{where} must be URLs.")


def _check_scalar(field: NoteField, value, where: str) -> None:
    """One text, textarea or select value."""
    if not isinstance(value, str):
        raise ValueError(f"{where} must be text.")
    # Options are optional even on a select: a `kind`-backed field with none
    # declared is the free-text type/group/tier the guide sections want.
    if field.type == FIELD_SELECT and field.options and value.strip():
        if value not in field.options:
            raise ValueError(
                f"'{value}' is not a valid {field.label.lower()}; "
                f"expected one of {', '.join(field.options)}."
            )


def _check_field(field: NoteField, value, where: str) -> None:
    """One submitted value against one field of the spec."""
    if _is_blank(value):
        if field.required:
            raise ValueError(f"{where} is required.")
        return

    if field.type == FIELD_LINKS:
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError(f"{where} must be a list of URLs.")
        return

    if field.type == FIELD_NAMES:
        # Free-text names, several allowed. Each must say something: a blank
        # name would draw an unnamed group on a grouped section.
        if not isinstance(value, list) or not all(
            isinstance(v, str) and v.strip() for v in value
        ):
            raise ValueError(f"{where} must be a list of non-empty names.")
        return

    if field.type == FIELD_LIST:
        if not isinstance(value, list):
            raise ValueError(f"{where} must be a list.")
        allowed = {f.key for f in field.item_fields}
        for i, row in enumerate(value, start=1):
            if not isinstance(row, dict):
                raise ValueError(f"{where} row {i} must be an object.")
            unknown = set(row) - allowed
            if unknown:
                raise ValueError(
                    f"{where} row {i} has no field "
                    f"'{sorted(unknown)[0]}'."
                )
            for item in field.item_fields:
                _check_field(item, row.get(item.key), f"{where} row {i}: {item.label}")
            # A row where every cell is blank is a stray Add click, not data.
            if all(_is_blank(row.get(f.key)) for f in field.item_fields):
                raise ValueError(f"{where} row {i} is empty.")
        return

    _check_scalar(field, value, where)


def _validate_structured(section: NoteSection, payload: NoteBase) -> None:
    """
    Check one structured row against its section's field spec.

    Structured sections own their whole validation, which is why this runs
    instead of the kind/status/emptiness rules the other shapes share: a
    `kind`-backed field with no options is free text here, and what counts as
    an empty row is "no field filled" rather than a per-shape rule.
    """
    spec = section.fields
    if not spec:
        raise ValueError(
            f"Section '{section.key}' is structured but declares no fields."
        )

    unknown = set(payload.fields or {}) - {f.key for f in spec if not f.column}
    if unknown:
        raise ValueError(
            f"Section '{section.key}' has no field '{sorted(unknown)[0]}'."
        )

    # A column no field claims must stay empty. Without this a payload could
    # park a value in `entries` or `locator` on a section that never shows it,
    # and the row would read back with content no editor can reach.
    claimed = {f.column for f in spec if f.column}
    for column in ("locator", "kind", "status", "title", "content", "links", "entries"):
        if column not in claimed and not _is_blank(getattr(payload, column, None)):
            raise ValueError(
                f"Section '{section.key}' takes no '{column}'."
            )

    for field in spec:
        _check_field(field, _field_value(field, payload), field.label)

    for group in section.require_any:
        if all(
            _is_blank(_field_value(field_by_key(section, key), payload))
            for key in group
            if field_by_key(section, key)
        ):
            labels = [
                field_by_key(section, key).label
                for key in group
                if field_by_key(section, key)
            ]
            raise ValueError(
                f"Section '{section.key}' needs at least one of: "
                f"{', '.join(labels)}."
            )

    # A DEFAULTED field cannot be the thing that makes a row worth storing.
    # The music_track shape says the same about `default_kind`: a value that
    # is always set would make every row non-empty, so an untouched draft with
    # a prefilled collect status would save as a row saying nothing. Only the
    # fields somebody had to fill in themselves count here.
    #
    # `or spec` keeps a section whose every field is defaulted from being
    # unsaveable outright; none is today, and a test asserts it.
    carrying = [f for f in spec if f.default is None] or list(spec)
    if all(_is_blank(_field_value(f, payload)) for f in carrying):
        raise ValueError(f"Section '{section.key}' note is empty.")



def validate_note_payload(payload: NoteBase) -> None:
    """
    Check one note against the registry.

    Raises ValueError, which the router turns into a 422. Singleton and
    one-per-kind uniqueness are not checked here - they need a database query,
    so the router owns them.
    """
    owner_type = payload.owner_type
    if owner_type not in OWNER_TABLES:
        raise ValueError(f"Unknown owner_type '{owner_type}'.")

    section = section_by_key(payload.section or "")
    if section is None:
        raise ValueError(f"Unknown note section '{payload.section}'.")

    if section.shape not in STORED_SHAPES:
        raise ValueError(
            f"Section '{section.key}' has its own table and is not stored as a note."
        )

    if owner_type not in section.owners:
        raise ValueError(
            f"Section '{section.key}' does not apply to owner type '{owner_type}'."
        )

    # A flat section refuses a parent outright, so a section does not grow a
    # tree because one payload carried a stray id. Whether the parent EXISTS
    # and belongs to this owner and section needs a query, so the router owns
    # that half.
    if payload.parent_id is not None and not section.hierarchical:
        raise ValueError(f"Section '{section.key}' rows do not nest.")

    # A structured section owns its whole validation - the kind, status and
    # emptiness rules below are per-shape, and this shape's rules live in its
    # registry spec instead.
    if section.shape == SHAPE_STRUCTURED:
        _validate_structured(section, payload)
        return

    if payload.fields is not None:
        raise ValueError(f"Section '{section.key}' takes no structured fields.")

    _check_links(section, payload.links)

    # A kind_category makes `kind` free text: the category only suggests.
    if payload.kind and not section.kind_category:
        allowed = kinds_for(section, owner_type)
        if not allowed:
            raise ValueError(
                f"Section '{section.key}' takes no kind for owner type "
                f"'{owner_type}'."
            )
        if payload.kind not in allowed:
            raise ValueError(
                f"'{payload.kind}' is not a valid kind for section '{section.key}'."
            )

    if payload.status:
        if not section.statuses:
            raise ValueError(f"Section '{section.key}' takes no status.")
        if payload.status not in section.statuses:
            raise ValueError(
                f"'{payload.status}' is not a valid status for section "
                f"'{section.key}'."
            )

    content = (payload.content or "").strip()
    if owner_type in section.desc_required and not content:
        raise ValueError(f"Section '{section.key}' requires content.")

    # Some sections are only about where they point: an OP/ED change or a
    # highlight with no episode names nothing.
    if section.locator_required and not (payload.locator or "").strip():
        raise ValueError(f"Section '{section.key}' requires a locator.")

    # A row with nothing in it is never worth storing. What counts as "nothing"
    # depends on the shape: a name_links row may carry only a title and a link,
    # and an episode_text row may carry only an episode.
    if section.shape == SHAPE_NAME_LINKS:
        if not content and not (payload.title or "").strip() and not payload.links:
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_NAME_ENTRIES:
        # A named bookmark with neither a name nor a single entry is nothing.
        if not (payload.title or "").strip() and not payload.entries:
            raise ValueError(f"Section '{section.key}' needs a name or an entry.")
    elif section.shape == SHAPE_EPISODE_TEXT:
        if not content and not (payload.locator or "").strip():
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_MUSIC_TRACK:
        # Any one column carries a song: a status alone is enough - "I still
        # need the OP" is a real note before the song has a name - and so is
        # an episode, since a remembered scene often comes before the title.
        # `kind` never counts: OP and ED default it to "normal", so it is
        # always set and would make every row non-empty.
        if (
            not content
            and not (payload.title or "").strip()
            and not (payload.status or "").strip()
            and not (payload.locator or "").strip()
            and not payload.links
        ):
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_MUSIC_STATUS:
        # One list's status and nothing else: which list, and how far.
        if not payload.kind:
            raise ValueError(
                f"Section '{section.key}' needs a kind: one of "
                f"{', '.join(kinds_for(section, owner_type))}."
            )
        if not payload.status:
            raise ValueError(f"Section '{section.key}' needs a status.")
        for column in ("locator", "title", "content", "links", "entries"):
            if not _is_blank(getattr(payload, column, None)):
                raise ValueError(f"Section '{section.key}' takes no '{column}'.")
    elif not content and not payload.links:
        raise ValueError(f"Section '{section.key}' note is empty.")
