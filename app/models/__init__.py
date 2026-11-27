"""
app.models package
Aggregates all SQLAlchemy ORM models. Importing this package registers every
model on Base.metadata, so string-based relationships resolve correctly.
"""
from app.database import Base, get_taipei_now
from app.models.access_mode import (
    AccessMode,
    UserAccessModeDenial,
)
from app.models.account_code import AccountCode
from app.models.anime import Anime
from app.models.anime_movie import AnimeMovies
from app.models.base import NameFallbackMixin
from app.models.book import Book, BookUnit
from app.models.cartoon import Cartoon
from app.models.character import (
    Character,
    CharacterCasting,
    CharacterCastingVoice,
    CharacterIdentity,
    CharacterTag,
)
from app.models.collection import Collection
from app.models.comic import Comic
from app.models.content_label import (
    CollectionContentLabel,
    ContentLabel,
    FranchiseContentLabel,
    MediaContentLabel,
    PersonContentLabel,
    SeriesContentLabel,
)
from app.models.franchise import Franchise, FranchiseRelation, Series, SeriesRelation
from app.models.game import Game
from app.models.game_choice import GameChoiceEdge, GameChoiceMark, GameChoiceNode
from app.models.game_copy import GameCopy
from app.models.h_comic import HComic
from app.models.h_game import HGame
from app.models.hentai import Hentai
from app.models.image import Image, ImageAttachment
from app.models.manga import Manga
from app.models.media import Media
from app.models.media_credit import MediaCredit, MediaTag
from app.models.media_relation import MediaRelation
from app.models.media_source import MediaSource  # noqa: F401
from app.models.meme import Meme
from app.models.movie import Movies
from app.models.needs_work import NeedsWork
from app.models.note import Note
from app.models.note_mark import NoteMark
from app.models.order import (
    OrderFollow,
    OrderFollowSkip,
    OrderItem,
    OrderList,
    OrderSection,
)
from app.models.plan_next import PlanNext
from app.models.quote import Quote
from app.models.resource import ResourceNode
from app.models.staff import (
    CompanyRelation,
    Person,
    PersonAffiliation,
    PersonMembership,
    PersonRole,
    Publisher,
    PublisherScope,
    Studio,
)
from app.models.system import (
    DataControlLog,
    DeletedRecord,
    Role,
    RolePermission,
    Seasonal,
    SystemConfigs,
    SystemOption,
    SystemOptionAlias,
    SystemOptionScope,
    SystemOptionUsage,
    User,
)
from app.models.tv_show import TVShows
from app.models.user_book_unit_rating import UserBookUnitRating
from app.models.user_favorite import UserFavorite
from app.models.user_highlight_group_order import UserHighlightGroupOrder
from app.models.user_media_list import UserMediaList
from app.models.user_rating import UserRating
from app.models.user_request import UserRequest

__all__ = [
    "Base",
    "get_taipei_now",
    "NameFallbackMixin",
    "Collection",
    "Franchise",
    "FranchiseRelation",
    "Series",
    "SeriesRelation",
    "Media",
    "UserFavorite",
    "UserHighlightGroupOrder",
    "UserMediaList",
    "UserBookUnitRating",
    "UserRating",
    "Anime",
    "AnimeMovies",
    "Movies",
    "TVShows",
    "Cartoon",
    "Character",
    "CharacterCasting",
    "CharacterCastingVoice",
    "CharacterIdentity",
    "CharacterTag",
    "Manga",
    "Book",
    "BookUnit",
    "Comic",
    "Game",
    "GameCopy",
    "GameChoiceNode",
    "GameChoiceEdge",
    "GameChoiceMark",
    "HComic",
    "Hentai",
    "HGame",
    "Image",
    "ImageAttachment",
    "OrderList",
    "OrderItem",
    "OrderSection",
    "OrderFollow",
    "OrderFollowSkip",
    "MediaRelation",
    "Person",
    "PersonRole",
    "PersonMembership",
    "Studio",
    "CompanyRelation",
    "PersonAffiliation",
    "Publisher",
    "PublisherScope",
    "MediaCredit",
    "MediaTag",
    "MediaSource",
    "PlanNext",
    "Quote",
    "Meme",
    "Note",
    "NoteMark",
    "NeedsWork",
    "ResourceNode",
    "SystemOption",
    "SystemOptionAlias",
    "SystemOptionScope",
    "SystemOptionUsage",
    "SystemConfigs",
    "Seasonal",
    "ContentLabel",
    "CollectionContentLabel",
    "FranchiseContentLabel",
    "SeriesContentLabel",
    "PersonContentLabel",
    "MediaContentLabel",
    "AccessMode",
    "UserAccessModeDenial",
    "Role",
    "RolePermission",
    "User",
    "AccountCode",
    "UserRequest",
    "DataControlLog",
    "DeletedRecord",
]

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import column_property  # noqa: E402

# ---------------------------------------------------------------------------
# `my_rating` and `*_expectation`, read side
# ---------------------------------------------------------------------------
# Not columns on these tables, and not mapped attributes. A rating of a
# group or an entity, and a tier's expectation, are the VIEWER'S own: they
# live in `user_rating`, one row per account, and
#     app.services.domain.user_rating.attach_ratings(db, owner_type, entries,
#                                                    user_id)
# puts the viewer's values back on the instances before they are serialised,
# one query per page. A book unit's `remark` is likewise the reader's own,
# on user_book_unit_rating beside its rating, attached by
# user_list.attach_unit_ratings.
#
# Plain class attributes defaulted to None, so a path that forgot to attach
# serialises null - never raises, never shows somebody else's value.
for _model in (
    Collection, Franchise, Series, Character, CharacterIdentity, Person, Studio, Publisher
):
    _model.my_rating = None
Collection.collection_expectation = None
Franchise.franchise_expectation = None
Series.series_expectation = None
BookUnit.remark = None
# An h-comic's and an h-game's highlight group order is the viewer's own too,
# in user_highlight_group_order, attached by
# app.services.domain.highlight_group_order.attach_group_orders.
HComic.highlight_group_order = None
HGame.highlight_group_order = None
# Whether a quote or a meme is a favourite is the viewer's own, in
# user_favorite, attached by
# app.services.domain.user_favorite.attach_favorites.
Quote.is_favorite = False
Meme.is_favorite = False


# ---------------------------------------------------------------------------
# `User.role`, read side
# ---------------------------------------------------------------------------
# `role` used to be a String column on users. It is now role_id -> role.name,
# and this maps the name back on so app/routers/auth.py can keep returning it
# on login and minting it as a JWT claim, and tests/api/test_auth.py can keep
# asserting on it.
#
# Read-only by construction: every write goes through
# role_id, so the two cannot disagree.
User.role = column_property(
    select(Role.name)
    .where(Role.system_id == User.role_id)
    .correlate_except(Role)
    .scalar_subquery()
)


# ---------------------------------------------------------------------------
# `media`, write side
# ---------------------------------------------------------------------------
# Every media entry has one row in `media`. The parent row is maintained by
# mapper events rather than by a router hook, because entries are written
# through the ORM directly as often as through the API. Registered here, after
# all models are imported, so the registrations sit together and no model
# module has to import Media. See app/models/media_sync.py for why.
from app.models.media_sync import register_media_sync  # noqa: E402

# (model, hyphenated MEDIA_TABLES key). Grows as each type is ported.
_MEDIA_TYPES = (
    (Anime, "anime"),
    (AnimeMovies, "anime-movie", False),  # no series: anime movies have none
    (Movies, "movie"),
    (TVShows, "tv-show"),
    (Cartoon, "cartoon"),
    (Manga, "manga"),
    (Book, "book"),
    (Comic, "comic"),
    (Game, "game"),
    (HComic, "h-comic"),
    (Hentai, "hentai"),
    (HGame, "h-game"),
)

for _entry in _MEDIA_TYPES:
    register_media_sync(*_entry)


# ---------------------------------------------------------------------------
# `quote` and `order_item`, read side
# ---------------------------------------------------------------------------
# Both tables now store a single `media_id` - a real FK up to `media` - where
# they used to carry a FK-less (media_type, entry_id) pair. The API keeps the
# pair: the SPA reads `media_type` and `entry_id` from quotes, memes, watch
# order steps and relations in 93 places, and Step 0 changes no user-visible
# behaviour. So the pair is derived here rather than stored.
#
# `entry_id` is a synonym: it IS media_id, the same uuid under the name the API
# uses, readable, writable and usable in a filter.
# `media_type` is read-only by construction, like `User.role` above - the media row is the only place it lives, so the two cannot disagree.
# That is a real gain: the old pair could store media_type="manga" beside an
# anime's entry_id and nothing would object.
from sqlalchemy.orm import synonym  # noqa: E402

for _model in (Quote, OrderItem):
    _model.entry_id = synonym("media_id")
    _model.media_type = column_property(
        select(Media.media_type)
        .where(Media.system_id == _model.media_id)
        .correlate_except(Media)
        .scalar_subquery()
    )
