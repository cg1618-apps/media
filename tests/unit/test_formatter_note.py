"""Unit tests for the Note sheet parser."""

import json
import uuid
from types import SimpleNamespace

from app.utils.formatter import note_public_cell, parse_note_from_sheet


def test_parses_a_full_row():
    owner_id = uuid.uuid4()
    parsed = parse_note_from_sheet(
        {
            "system_id": str(uuid.uuid4()),
            "owner_type": "anime",
            "owner_id": str(owner_id),
            "section": "op_ed_changes",
            "locator": "ep 10",
            "kind": "變化OP",
            "title": "",
            "content": "這集OP換成劇中曲",
            "links": '["https://example.com/a"]',
            "sort_index": "0",
            "created_at": "",
            "updated_at": "",
        }
    )
    # The pair is carried through as `_legacy_*`; pull.py resolves it into
    # media_id / collection_id / franchise_id / series_id.
    assert parsed["_legacy_owner_type"] == "anime"
    assert parsed["_legacy_owner_id"] == owner_id
    assert parsed["media_id"] is None
    assert parsed["section"] == "op_ed_changes"
    assert parsed["locator"] == "ep 10"
    assert parsed["kind"] == "變化OP"
    assert parsed["links"] == [{"text": None, "url": "https://example.com/a"}]
    assert parsed["sort_index"] == 0.0
    assert parsed["created_at"] is None


def test_unparseable_owner_id_becomes_none():
    # A junk cell must not fail the import; pull.py then reports the row as
    # having no resolvable owner and skips it rather than writing a null FK.
    parsed = parse_note_from_sheet({"owner_id": "not-a-uuid", "section": "advantages"})
    assert parsed["_legacy_owner_id"] is None


def test_the_four_owner_columns_are_read_when_present():
    media_id = uuid.uuid4()
    parsed = parse_note_from_sheet(
        {"media_id": str(media_id), "section": "advantages"}
    )
    assert parsed["media_id"] == media_id
    assert parsed["collection_id"] is None
    assert parsed["franchise_id"] is None
    assert parsed["series_id"] is None


def test_blank_links_cell_becomes_none():
    parsed = parse_note_from_sheet({"section": "advantages", "links": ""})
    assert parsed["links"] is None


def test_legacy_episode_header_still_parses_as_locator():
    # The column was renamed after sheets already existed. A spreadsheet backed
    # up before the rename must still Pull, or its anchors are silently lost.
    parsed = parse_note_from_sheet({"section": "highlights", "episode": "ep 6"})
    assert parsed["locator"] == "ep 6"


def test_locator_wins_over_a_stale_episode_column():
    # A sheet carrying both (renamed header added beside the old one) trusts
    # the current name.
    parsed = parse_note_from_sheet(
        {"section": "highlights", "locator": "ep 6", "episode": "ep 1"}
    )
    assert parsed["locator"] == "ep 6"


def test_entries_round_trip_through_the_sheet():
    # Backup writes `entries` because the headers derive from the model's
    # columns; a parser that drops it loses every guides / builds_and_mods
    # item on the machine-to-machine round trip this project runs on.
    raw = [
        {"type": "text", "value": "Kill the boss first", "label": None},
        {"type": "link", "value": "https://example.com/build", "label": "Build"},
    ]
    parsed = parse_note_from_sheet(
        {"section": "guides", "entries": json.dumps(raw, ensure_ascii=False)}
    )
    assert parsed["entries"] == raw


def test_blank_entries_cell_becomes_none():
    parsed = parse_note_from_sheet({"section": "guides", "entries": ""})
    assert parsed["entries"] is None


def test_an_old_sheet_pulls_url_strings_as_untitled_pairs():
    # A sheet backed up before every note link became a pair carries URL
    # strings; Pull reads each as a pair with no title, as the local rows
    # became.
    parsed = parse_note_from_sheet(
        {"section": "easter_eggs", "links": '["https://a.example"]', "fields": "{}"}
    )
    assert parsed["links"] == [{"text": None, "url": "https://a.example"}]
    # A structured row's empty `fields` blob does not follow it into a shape
    # that refuses one, or the row's next edit would be refused.
    assert parsed["fields"] is None


def test_pairs_pull_as_they_are():
    pairs = [{"text": "YouTube", "url": "https://youtu.be/a"}]
    parsed = parse_note_from_sheet({"section": "op", "links": json.dumps(pairs)})
    assert parsed["links"] == pairs


# --- an old sheet's rows, reshaped as the local ones were -----------------


def test_an_old_controls_row_pulls_its_links_into_the_description():
    parsed = parse_note_from_sheet(
        {
            "section": "controls",
            "content": "Parry.",
            "links": '["https://a.example", {"text": "Video", "url": "https://b.example"}]',
        }
    )
    assert parsed["content"] == "Parry.\nhttps://a.example\nVideo: https://b.example"
    assert parsed["links"] is None


def test_an_old_plot_row_pulls_its_description_as_the_chapter():
    parsed = parse_note_from_sheet(
        {
            "section": "main_plot",
            "locator": "【Bilibili】 1.6丹青渡 日配女主全劇情全流程",
            "content": "祀的劇情",
            "links": '["https://b23.tv/x"]',
        }
    )
    assert parsed["locator"] == "祀的劇情"
    assert parsed["content"] is None
    assert parsed["links"] == [
        {"text": "【Bilibili】 1.6丹青渡 日配女主全劇情全流程", "url": "https://b23.tv/x"}
    ]


def test_a_new_plot_row_pulls_unchanged():
    # The mirror: a row already in the new shape is left alone.
    links = [{"text": "Part 1", "url": "https://b23.tv/x"}]
    parsed = parse_note_from_sheet(
        {"section": "main_plot", "locator": "Ch 3", "links": json.dumps(links)}
    )
    assert (parsed["locator"], parsed["links"]) == ("Ch 3", links)


def test_an_old_character_arc_pulls_its_text_into_the_link_title_or_story_other():
    with_link = parse_note_from_sheet(
        {
            "section": "character_arcs",
            "content": "Perlica's arc",
            "links": '["https://a.example"]',
        }
    )
    assert with_link["section"] == "character_arcs"
    assert with_link["content"] is None
    assert with_link["links"] == [{"text": "Perlica's arc", "url": "https://a.example"}]
    without = parse_note_from_sheet(
        {"section": "character_arcs", "content": "Perlica's arc"}
    )
    assert without["section"] == "story_other"
    assert without["content"] == "【角色劇情】 Perlica's arc"


def test_a_structured_section_keeps_its_fields():
    parsed = parse_note_from_sheet(
        {"section": "builds_and_styles", "fields": '{"stats": []}'}
    )
    assert parsed["fields"] == {"stats": []}


def test_a_reviews_and_comments_row_pulls_as_public_reviews():
    # The section left the registry; an older sheet still names it, and its
    # rows land where the migration put the local ones.
    parsed = parse_note_from_sheet(
        {"section": "reviews_and_comments", "content": "worth it"}
    )
    assert parsed["section"] == "public_reviews"
    # The mirror: every other section passes through untouched.
    assert parse_note_from_sheet({"section": "advantages"})["section"] == "advantages"


def test_a_remark_list_row_pulls_as_personal_notes():
    # 備註列表 was renamed 個人筆記; an older sheet still names the old key.
    parsed = parse_note_from_sheet({"section": "remark_list", "content": "mine"})
    assert parsed["section"] == "personal_notes"
    # The mirror: the shared remark keeps its key.
    assert parse_note_from_sheet({"section": "remark"})["section"] == "remark"


# --- The kind of a pros-and-cons row ----------------------------------------
# 優點 / 缺點 / 優缺點 were personal-scope, so an older sheet carries their rows
# with `personal` FALSE and no `public` column. Reading `personal` there would
# publish every one of them; the kind comes from `public` instead.


def _pros_row(**cells):
    return {"system_id": "", "section": "advantages", "content": "Tight combat", **cells}


def test_an_old_sheets_pros_row_restores_personal():
    assert parse_note_from_sheet(_pros_row(personal="FALSE"))["personal"] is True


def test_a_pros_row_marked_public_restores_public():
    assert parse_note_from_sheet(_pros_row(personal="FALSE", public="TRUE"))["personal"] is False


def test_another_mixed_section_still_reads_personal():
    # The mirror: 物品 Items has no kind choice, so `personal` decides.
    row = {"system_id": "", "section": "items", "title": "Flask", "personal": "FALSE"}
    assert parse_note_from_sheet(row)["personal"] is False
    assert parse_note_from_sheet({**row, "personal": "TRUE"})["personal"] is True


def test_backup_writes_public_only_on_a_public_pros_row():
    assert note_public_cell(SimpleNamespace(section="advantages", personal=False), None) is True
    assert note_public_cell(SimpleNamespace(section="advantages", personal=True), None) is None
    assert note_public_cell(SimpleNamespace(section="items", personal=False), None) is None
