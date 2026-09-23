"""routers/h_comic.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

H-Comic is a gated type: every entry carries the `h-comic` content label, so
the factory's ordinary visibility gate hides the whole type from a session
whose mode lacks it. Nothing here widens or narrows that.
"""
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router

router = make_media_router(MEDIA_REGISTRY["h_comic"])
