"""
The admin's own pages, each on its own key rather than manage.catalog.

Announcements (manage.announcements), the Note pages' APIs - /api/options
writes and /api/constants/external-apis (manage.options), /api/images
(manage.images) and /api/resources, reads and writes (manage.resources).

Every refusal below runs against a row that is THERE - an announcement, an
option, an image, a resource tree - so a 401 is the gate's and not an empty
table's. And every refusal is by a catalogue editor: an account holding
manage.catalog, the key these pages used to answer to, plus the whole member
set, so the only thing it lacks is the page's own key. The mirror sends the
same requests, against the same rows, as super (which holds every key by
lock) and as an account holding the page's key and nothing beyond the guest
reads - the shape the admin has, holding no manage.catalog.

Form defaults and picker defaults are the other way round: catalogue-editing
tools, so manage.catalog still opens them and manage.options does not.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import io
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library
from app.services.rbac.permissions import (
    ENTITY_VIEW_PERMISSIONS,
    PERM_MANAGE_ANNOUNCEMENTS,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_IMAGES,
    PERM_MANAGE_OPTIONS,
    PERM_MANAGE_RESOURCES,
)
from app.services.rbac.seed import default_guest_permissions, default_user_permissions
from tests.api.conftest import make_viewer


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(colour=(10, 120, 200)):
    """A small PNG. The library deduplicates by content, so an upload that
    must add a second image passes a colour of its own."""
    buf = io.BytesIO()
    PILImage.new("RGB", (20, 20), colour).save(buf, format="PNG")
    return buf.getvalue()


def _catalogue_editor(db_session, client):
    """manage.catalog and every member read - everything but the page keys."""
    held = default_user_permissions() | ENTITY_VIEW_PERMISSIONS | {PERM_MANAGE_CATALOG}
    return make_viewer(db_session, client, "cat-editor", held)


def _page_key_holder(db_session, client, permission):
    """The admin's shape: the page's key, the guest reads, no manage.catalog."""
    return make_viewer(
        db_session, client, f"holds-{permission}", default_guest_permissions() | {permission}
    )


def _send(client, method, url, body=None, files=None):
    kwargs = {}
    if body is not None:
        kwargs["json"] = body
    if files is not None:
        kwargs["files"] = files
    return getattr(client, method)(url, **kwargs)


# ---------------------------------------------------------------------------
# The rows each page acts on. Load-bearing for every refusal in this file.
# ---------------------------------------------------------------------------


@pytest.fixture
def announcement(db_session):
    db_session.add(
        models.SystemConfigs(config_key="announcement:Notice", config_value="Hello")
    )
    db_session.flush()
    return "Notice"


def _announcement_requests(title):
    return [
        ("post", "/api/announcements/", {"title": "Second", "body": "Two"}),
        (
            "put",
            "/api/announcements/",
            {"original_title": title, "title": title, "body": "Edited"},
        ),
        ("delete", "/api/announcements/?title=Second", None),
    ]


@pytest.fixture
def option(db_session):
    row = models.SystemOption(
        system_id=uuid.uuid4(), category="Genre Main", value="Zvornik Option"
    )
    db_session.add(row)
    db_session.flush()
    return row


def _option_requests(option):
    return [
        ("get", "/api/constants/external-apis", None),
        ("post", "/api/options/", {"category": "Genre Main", "value": "Zvornik New"}),
        (
            "put",
            f"/api/options/{option.system_id}",
            {"category": "Genre Main", "value": "Zvornik Renamed"},
        ),
        ("delete", f"/api/options/{option.system_id}", None),
    ]


@pytest.fixture
def image(super_client, db_session):
    response = super_client.post(
        "/api/images", files={"file": ("seed.png", _png(), "image/png")}
    )
    assert response.status_code == 201, response.text
    return response.json()["system_id"]


def _image_requests(image_id):
    return [
        ("get", "/api/images", None),
        ("post", "/api/images", None),  # upload: files= is added by _send_image
        ("delete", f"/api/images/{image_id}", None),
    ]


def _send_image(client, method, url, body):
    if method == "post":
        return _send(
            client, method, url, files={"file": ("c.png", _png((200, 30, 30)), "image/png")}
        )
    return _send(client, method, url, body)


def _node(db_session, kind, parent=None, title=None, content=None, sort_index=0.0):
    node = models.ResourceNode(
        system_id=uuid.uuid4(),
        parent_id=parent.system_id if parent is not None else None,
        kind=kind,
        title=title,
        content=content,
        sort_index=sort_index,
    )
    db_session.add(node)
    db_session.flush()
    return node


@pytest.fixture
def resources(db_session):
    tools = _node(db_session, "group", title="Tools", sort_index=0.0)
    item = _node(db_session, "item", parent=tools, content="plain", sort_index=0.0)
    spare = _node(db_session, "group", title="Spare", sort_index=1.0)
    return {"tools": tools, "item": item, "spare": spare}


def _resource_requests(tree):
    tools_id = str(tree["tools"].system_id)
    return [
        ("get", "/api/resources", None),
        ("patch", "/api/resources/reorder", {"parent_id": None, "ordered_ids": [
            str(tree["spare"].system_id), tools_id,
        ]}),
        ("post", "/api/resources", {"kind": "item", "parent_id": tools_id, "content": "x"}),
        ("patch", f"/api/resources/{tree['item'].system_id}", {"content": "edited"}),
        ("delete", f"/api/resources/{tree['spare'].system_id}", None),
    ]


# ---------------------------------------------------------------------------
# Announcements: manage.announcements
# ---------------------------------------------------------------------------


def test_a_catalogue_editor_is_refused_every_announcement_write(
    db_session, client, announcement
):
    editor = _catalogue_editor(db_session, client)
    for method, url, body in _announcement_requests(announcement):
        assert _send(editor, method, url, body).status_code == 401, (method, url)
    db_session.expire_all()
    rows = db_session.query(models.SystemConfigs).filter(
        models.SystemConfigs.config_key.like("announcement:%")
    )
    assert {(r.config_key, r.config_value) for r in rows} == {
        ("announcement:Notice", "Hello")
    }


@pytest.mark.parametrize("who", ["super", "page_key"])
def test_the_announcement_key_makes_every_write(
    request, db_session, client, announcement, who
):
    writer = (
        request.getfixturevalue("super_client")
        if who == "super"
        else _page_key_holder(db_session, client, PERM_MANAGE_ANNOUNCEMENTS)
    )
    for method, url, body in _announcement_requests(announcement):
        r = _send(writer, method, url, body)
        assert r.status_code == 200, (method, url, r.text)
    db_session.expire_all()
    row = db_session.query(models.SystemConfigs).filter_by(
        config_key="announcement:Notice"
    ).one()
    assert row.config_value == "Edited"


# ---------------------------------------------------------------------------
# The Note pages: manage.options
# ---------------------------------------------------------------------------


def test_a_catalogue_editor_is_refused_the_note_page_apis(db_session, client, option):
    editor = _catalogue_editor(db_session, client)
    for method, url, body in _option_requests(option):
        assert _send(editor, method, url, body).status_code == 401, (method, url)
    db_session.expire_all()
    values = {o.value for o in db_session.query(models.SystemOption)}
    assert "Zvornik Option" in values
    assert "Zvornik New" not in values
    # The vocabulary itself is still everyone's to read: only the writes moved.
    listed = {o["value"] for o in editor.get("/api/options/Genre Main").json()}
    assert "Zvornik Option" in listed


@pytest.mark.parametrize("who", ["super", "page_key"])
def test_the_options_key_reaches_every_note_page_api(
    request, db_session, client, option, who
):
    writer = (
        request.getfixturevalue("super_client")
        if who == "super"
        else _page_key_holder(db_session, client, PERM_MANAGE_OPTIONS)
    )
    for method, url, body in _option_requests(option):
        r = _send(writer, method, url, body)
        assert r.status_code == 200, (method, url, r.text)
    db_session.expire_all()
    assert db_session.get(models.SystemOption, option.system_id) is None
    values = {o.value for o in db_session.query(models.SystemOption)}
    assert "Zvornik New" in values


# ---------------------------------------------------------------------------
# The image library: manage.images
# ---------------------------------------------------------------------------


def test_a_catalogue_editor_is_refused_the_image_library(db_session, client, image):
    editor = _catalogue_editor(db_session, client)
    for method, url, body in _image_requests(image):
        assert _send_image(editor, method, url, body).status_code == 401, (method, url)
    db_session.expire_all()
    assert db_session.query(models.Image).count() == 1


@pytest.mark.parametrize("who", ["super", "page_key"])
def test_the_images_key_reaches_the_image_library(
    request, db_session, client, image, who
):
    writer = (
        request.getfixturevalue("super_client")
        if who == "super"
        else _page_key_holder(db_session, client, PERM_MANAGE_IMAGES)
    )
    listed = writer.get("/api/images")
    assert listed.status_code == 200, listed.text
    assert image in {row["system_id"] for row in listed.json()["images"]}
    for method, url, body in _image_requests(image)[1:]:
        r = _send_image(writer, method, url, body)
        assert r.status_code in (201, 204), (method, url, r.text)
    db_session.expire_all()
    assert db_session.get(models.Image, uuid.UUID(image)) is None
    assert db_session.query(models.Image).count() == 1


# ---------------------------------------------------------------------------
# Resources: manage.resources, reads as well as writes
# ---------------------------------------------------------------------------


def test_a_catalogue_editor_is_refused_resources_reads_and_writes(
    db_session, client, resources
):
    editor = _catalogue_editor(db_session, client)
    for method, url, body in _resource_requests(resources):
        assert _send(editor, method, url, body).status_code == 401, (method, url)
    db_session.expire_all()
    assert db_session.query(models.ResourceNode).count() == 3
    assert db_session.get(models.ResourceNode, resources["item"].system_id).content == "plain"


def test_a_member_is_refused_the_resources_page(user_client, resources):
    """`user` holds every member read, and none of them opens this one."""
    assert user_client.get("/api/resources").status_code == 401


def test_super_reads_the_resources_page(super_client, resources):
    """The mirror on the same rows."""
    r = super_client.get("/api/resources")
    assert r.status_code == 200
    assert [n["title"] for n in r.json()] == ["Tools", "Spare"]


@pytest.mark.parametrize("who", ["super", "page_key"])
def test_the_resources_key_makes_every_read_and_write(
    request, db_session, client, resources, who
):
    writer = (
        request.getfixturevalue("super_client")
        if who == "super"
        else _page_key_holder(db_session, client, PERM_MANAGE_RESOURCES)
    )
    for method, url, body in _resource_requests(resources):
        r = _send(writer, method, url, body)
        assert r.status_code in (200, 201), (method, url, r.text)
    db_session.expire_all()
    assert db_session.get(models.ResourceNode, resources["item"].system_id).content == "edited"
    assert db_session.get(models.ResourceNode, resources["spare"].system_id) is None


# ---------------------------------------------------------------------------
# Form and picker defaults stay on manage.catalog
# ---------------------------------------------------------------------------


def _defaults_requests():
    return [
        ("put", "/api/form-defaults/anime", {"defaults": {"ep_total": "12"}}),
        ("get", "/api/form-defaults/anime", None),
        ("put", "/api/random-picker-defaults/anime", {"filters": {"airingType": ["TV"]}}),
        ("delete", "/api/random-picker-defaults/anime", None),
        ("delete", "/api/form-defaults/anime", None),
    ]


def test_a_catalogue_writer_still_saves_form_and_picker_defaults(db_session, client):
    writer = make_viewer(
        db_session, client, "defaults-writer", default_guest_permissions() | {PERM_MANAGE_CATALOG}
    )
    for method, url, body in _defaults_requests():
        r = _send(writer, method, url, body)
        assert r.status_code == 200, (method, url, r.text)


def test_the_options_key_does_not_open_form_or_picker_defaults(db_session, client):
    """The mirror: the Note pages' key is not a catalogue tool's."""
    holder = _page_key_holder(db_session, client, PERM_MANAGE_OPTIONS)
    for method, url, body in _defaults_requests():
        assert _send(holder, method, url, body).status_code == 401, (method, url)
