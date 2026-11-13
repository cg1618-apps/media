"""Note request/response schemas, validated against the section registry."""

from datetime import datetime
from typing import List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import (
    FIELD_CHOICE_NODE,
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
    personal_values,
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
    # The system_option category whose values the editor suggests for a
    # free-text select. Suggestions only - the value stays free text.
    option_category: Optional[str] = None
    # Populated for `list` fields alone: the shape of one nested row.
    item_fields: List["NoteFieldOut"] = []
    # The value is the VIEWER's own, not the row's: it is read from and
    # written to the viewer's note mark (PUT /api/notes/{id}/mark), never
    # through a catalogue write, which drops it.
    personal: bool = False
    # The granted feature a personal field is behind. A viewer without it is
    # never sent the field, so a field listed here is one the viewer holds.
    granted: Optional[str] = None


class NoteMoveTarget(BaseModel):
    """A section a row can be quick-moved to, labelled for the owner."""

    key: str
    label: str


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
    # `kind` is a free-text group name the card draws one heading per
    # (Resources' Group). Set only where `kinds` is empty.
    kind_is_group: bool = False
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
    # The sections a row of this one can be moved straight to (a PATCH of
    # `section`): the owner's other `quick_move` sections in the same group,
    # in registry order. Empty where the section does not quick-move.
    move_targets: List[NoteMoveTarget] = []
    # The row's `status` is the viewer's own (the song lists, music_status),
    # read and written like a personal field under the mark key "status".
    personal_status: bool = False
    # The granted feature that status is behind. Without it `statuses`,
    # `default_status` and the type-status keys above are empty, because the
    # viewer does not see the status at all.
    status_granted: Optional[str] = None


class NoteReorder(BaseModel):
    """New ordering for one section of one owner."""

    owner_type: str
    owner_id: UUID
    section: str
    ordered_ids: List[UUID]


class NoteMarkWrite(BaseModel):
    """
    PUT /api/notes/{id}/mark: {values: {key: value | null}}. Each key is one
    of the row's personal values - a personal field's key, or "status" for a
    section-level personal status. A key with a value sets it, null or blank
    clears it, a key not named is left alone.
    """

    model_config = ConfigDict(extra="forbid")

    values: dict[str, Optional[str]]


class NgResetRequest(BaseModel):
    """POST /api/notes/ng-reset: the one owner whose rows start a new cycle."""

    model_config = ConfigDict(extra="forbid")

    owner_type: str
    owner_id: UUID


class NgResetResult(BaseModel):
    cleared: int


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
        option_category=field.option_category,
        item_fields=[field_out(f) for f in field.item_fields],
        personal=field.personal,
        granted=field.granted,
    )


def move_targets_for(section: NoteSection, owner_type: str) -> List[NoteMoveTarget]:
    """
    The sections a row of `section` can be quick-moved to on this owner.

    Resolved per owner because the group is: a target in another card would
    move a row somewhere its reader is not looking.
    """
    if not section.quick_move:
        return []
    group = group_for(section, owner_type)
    return [
        NoteMoveTarget(key=other.key, label=label_for(other, owner_type))
        for other in sections_for(owner_type)
        if other.quick_move
        and other.key != section.key
        and group_for(other, owner_type) == group
    ]


def _withheld(granted: Optional[str], features: Optional[frozenset]) -> bool:
    """Whether a value granted by `granted` is hidden from a viewer holding
    `features`. None describes the registry for nobody in particular."""
    return granted is not None and features is not None and granted not in features


def section_out(
    section: NoteSection, owner_type: str, features: Optional[frozenset] = None
) -> NoteSectionOut:
    """
    Resolve a registry entry for one owner type, and for a viewer holding the
    granted features `features`: a personal value granted by one it lacks is
    left out - its field dropped, a personal status's vocabulary and default
    emptied, and a song list's type status unlinked - because the viewer does
    not see it at all. The router always passes the viewer's set; None
    (every value present) is the registry's own view, for tests and tools.
    """
    group = group_by_key(group_for(section, owner_type) or "")
    type_status = section_by_key(section.type_status_section or "")
    if type_status is not None and _withheld(type_status.status_granted, features):
        type_status = None
    status_hidden = section.personal_status and _withheld(
        section.status_granted, features
    )
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
        statuses=[] if status_hidden else list(section.statuses),
        locator_placeholder=locator_for(section, owner_type),
        locator_required=section.locator_required,
        takes_links=section.takes_links,
        singleton=section.singleton,
        desc_required=owner_type in section.desc_required,
        fields=[
            field_out(f) for f in section.fields if not _withheld(f.granted, features)
        ],
        require_any=[list(group) for group in section.require_any],
        hierarchical=section.hierarchical,
        group_by=section.group_by,
        groupable_by=section.groupable_by,
        owner_where={k: list(v) for k, v in section.owner_where.items()},
        link_pairs=uses_link_pairs(section),
        link_text_category=section.link_text_category,
        kind_category=section.kind_category,
        kind_is_group=section.kind_is_group,
        default_status=None if status_hidden else section.default_status,
        one_per_kind=section.one_per_kind,
        hidden=section.hidden,
        type_status_section=type_status.key if type_status else None,
        type_statuses=list(type_status.statuses) if type_status else [],
        type_status_default=type_status.default_status if type_status else None,
        move_targets=move_targets_for(section, owner_type),
        personal_status=section.personal_status,
        status_granted=section.status_granted,
    )


def sections_out(
    owner_type: str, features: Optional[frozenset] = None
) -> List[NoteSectionOut]:
    """The whole registry for one owner type, in display order."""
    return [section_out(s, owner_type, features) for s in sections_for(owner_type)]


def drop_personal_values(section: NoteSection, payload: NoteBase) -> None:
    """
    Take every personal value out of a catalogue payload, in place: a
    column-backed one set to None, a `fields` one removed from the blob.

    A catalogue write never stores a viewer's value - that is the mark's
    (PUT /api/notes/{id}/mark) - so the key is ignored rather than refused:
    the page sends a whole row back, and refusing would make every edit of a
    row it had drawn with the viewer's values fail. Its option is not checked
    either, for the same reason.
    """
    for value in personal_values(section):
        if value.column:
            if getattr(payload, value.column, None) is not None:
                setattr(payload, value.column, None)
        elif payload.fields and value.key in payload.fields:
            payload.fields = {
                k: v for k, v in payload.fields.items() if k != value.key
            }


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

    if field.type == FIELD_CHOICE_NODE:
        # Only the shape is checked here. Whether the uuid names a node of the
        # note's own game needs a query, so the note router owns that half.
        if not isinstance(value, str):
            raise ValueError(f"{where} must be the id of a choice node.")
        try:
            UUID(value.strip())
        except ValueError:
            raise ValueError(f"{where} must be the id of a choice node.")
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


def _structured_empty(section: NoteSection, payload: NoteBase) -> bool:
    """
    Whether a structured row says nothing in the catalogue.

    A DEFAULTED field cannot be the thing that makes a row worth storing.
    The music_track shape says the same about `default_kind`: a value that
    is always set would make every row non-empty, so an untouched draft with
    a prefilled collect status would save as a row saying nothing. Only the
    fields somebody had to fill in themselves count here.

    `or catalogue` keeps a section whose every field is defaulted from being
    unsaveable outright; none is today, and a test asserts it.

    A personal field never counts either: it is never stored on the row
    (drop_personal_values removes it), so a row whose only value is
    somebody's "collected" says nothing in the catalogue.
    """
    catalogue = [f for f in section.fields if not f.personal]
    carrying = [f for f in catalogue if f.default is None] or catalogue
    return all(_is_blank(_field_value(f, payload)) for f in carrying)


def _music_track_empty(payload: NoteBase) -> bool:
    """
    Whether a song row says nothing in the catalogue. Any one column carries
    a song: a name, an episode (a remembered scene often comes before the
    title), a link or a remark. The status is not one of them - it is each
    viewer's own. `kind` never counts: OP and ED default it to "normal", so
    it is always set and would make every row non-empty.
    """
    return (
        not (payload.content or "").strip()
        and not (payload.title or "").strip()
        and not (payload.locator or "").strip()
        and not payload.links
    )


def catalogue_empty(payload: NoteBase) -> bool:
    """
    Whether a row of one of the two shapes a personal value can be the only
    content of - structured and music_track - says nothing once its personal
    values are set aside. False for every other shape and unknown section.
    Leaves `payload` untouched.
    """
    section = section_by_key(payload.section or "")
    if section is None:
        return False
    copy = payload.model_copy(deep=True)
    drop_personal_values(section, copy)
    if section.shape == SHAPE_STRUCTURED:
        return _structured_empty(section, copy)
    if section.shape == SHAPE_MUSIC_TRACK:
        return _music_track_empty(copy)
    return False


def _validate_structured(
    section: NoteSection, payload: NoteBase, allow_empty: bool = False
) -> None:
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

    if not allow_empty and _structured_empty(section, payload):
        raise ValueError(f"Section '{section.key}' note is empty.")

    _check_root_only_group(section, payload)


def _check_root_only_group(section: NoteSection, payload: NoteBase) -> None:
    """
    On a section that both nests and groups, only a top-level row carries a
    group: the grouped view groups the roots and draws each subtree under its
    root, so a child's own group is a value nothing would read.

    Checked on the row as it will be, so a PATCH that reparents a grouped root
    has to clear its group in the same request.
    """
    if not (section.hierarchical and section.groupable_by):
        return
    if payload.parent_id is None:
        return
    field = field_by_key(section, section.groupable_by)
    if not _is_blank(_field_value(field, payload)):
        raise ValueError("Only a top-level row carries a group.")



def validate_note_payload(payload: NoteBase, allow_empty: bool = False) -> None:
    """
    Check one note against the registry.

    Raises ValueError, which the router turns into a 422. Singleton and
    one-per-kind uniqueness are not checked here - they need a database query,
    so the router owns them.

    `allow_empty` lifts the "note is empty" refusal of the two shapes a
    personal value used to fill (structured and music_track; see
    `catalogue_empty`). The router passes it on a PATCH of a row that is
    ALREADY empty in the catalogue - a song or a stat whose only value was
    its status or "my value", now somebody's mark - so that row can still be
    edited. A PATCH can never empty a row that says something.
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

    # A personal value is the viewer's own and is never part of a catalogue
    # row; it goes before anything below can count or check it.
    drop_personal_values(section, payload)

    # A structured section owns its whole validation - the kind, status and
    # emptiness rules below are per-shape, and this shape's rules live in its
    # registry spec instead.
    if section.shape == SHAPE_STRUCTURED:
        _validate_structured(section, payload, allow_empty)
        return

    if payload.fields is not None:
        raise ValueError(f"Section '{section.key}' takes no structured fields.")

    _check_links(section, payload.links)

    # A kind_category makes `kind` free text: the category only suggests. A
    # group flag makes it free text too, with nothing to suggest from.
    if payload.kind and not (section.kind_category or section.kind_is_group):
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
        if not allow_empty and _music_track_empty(payload):
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_MUSIC_STATUS:
        # Which list, and nothing else. How far each viewer has got with it is
        # that viewer's own status, dropped above and kept in its mark.
        if not payload.kind:
            raise ValueError(
                f"Section '{section.key}' needs a kind: one of "
                f"{', '.join(kinds_for(section, owner_type))}."
            )
        for column in ("locator", "title", "content", "links", "entries"):
            if not _is_blank(getattr(payload, column, None)):
                raise ValueError(f"Section '{section.key}' takes no '{column}'.")
    elif not content and not payload.links:
        raise ValueError(f"Section '{section.key}' note is empty.")
