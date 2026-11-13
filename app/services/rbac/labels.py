"""
The content labels, defined once.

A label marks an entry or a group that some access modes do not show. It is
code, not data, for the same reason gated types and field groups are: a label
carries rules - the lowest mode that shows it, the gated type that requires
it - and a rule the code branches on must not be editable out from under it.
The admin attaches and detaches labels; nobody creates, renames or deletes one
in the app.

`content_label` rows still exist, as the foreign-key target of the two
assignment tables. They are a mirror of this tuple, kept so by
gated_labels.ensure_labels on every start.

The modes form the order in seed_modes.MODE_ORDER, so a label's lowest mode
decides every mode's answer: a mode shows the label when it is at or above
that mode.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ContentLabelDef:
    key: str
    # Chinese where the owner chose one; the gated types keep their type names.
    name: str
    # What the label marks, in Chinese, and nothing about who sees it: that is
    # generated from lowest_mode wherever it is shown.
    description: str
    # The lowest mode in seed_modes.MODE_ORDER that shows the label.
    lowest_mode: str
    # The gated media type every entry of which carries this label, if any.
    gated_type: Optional[str] = None


# Order is display order, and is written into content_label.sort_order.
CONTENT_LABELS: tuple[ContentLabelDef, ...] = (
    ContentLabelDef(
        key="nsfw",
        name="NSFW",
        description="不適合公開場合觀看",
        lowest_mode="normal",
    ),
    ContentLabelDef(
        key="ecchi",
        name="輕微色情",
        description="含性感或福利畫面，但公共場合還是能看，也能大家一起看",
        lowest_mode="normal",
    ),
    ContentLabelDef(
        key="erotica",
        name="擦邊肉番",
        description="以性暗示或擦邊情節為主，接近但未達成人作品，建議自己私底下看",
        lowest_mode="borderline",
    ),
    ContentLabelDef(
        key="hentai",
        name="Hentai",
        description="成人動畫",
        lowest_mode="unrestricted",
        gated_type="hentai",
    ),
    ContentLabelDef(
        key="h-game",
        name="H-Game",
        description="成人遊戲",
        lowest_mode="unrestricted",
        gated_type="h-game",
    ),
    ContentLabelDef(
        key="h-comic",
        name="H-Comic",
        description="成人漫畫",
        lowest_mode="unrestricted",
        gated_type="h-comic",
    ),
)

LABEL_KEYS: tuple[str, ...] = tuple(label.key for label in CONTENT_LABELS)

_BY_KEY: dict[str, ContentLabelDef] = {label.key: label for label in CONTENT_LABELS}


def label_by_key(key: str) -> Optional[ContentLabelDef]:
    return _BY_KEY.get(key)


def labels_shown_in(mode_key: str) -> tuple[str, ...]:
    """The label keys a mode shows, in display order. Empty for an unknown mode
    - fail-closed, as everywhere on the object axis."""
    from app.services.rbac.seed_modes import mode_rank

    rank = mode_rank(mode_key)
    if rank is None:
        return ()
    return tuple(
        label.key for label in CONTENT_LABELS if mode_rank(label.lowest_mode) <= rank
    )


def modes_showing(label_key: str) -> tuple[str, ...]:
    """The mode keys that show a label, in MODE_ORDER."""
    from app.services.rbac.seed_modes import MODE_ORDER

    return tuple(key for key in MODE_ORDER if label_key in labels_shown_in(key))
