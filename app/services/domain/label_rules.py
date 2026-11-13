"""
The rule every label write obeys: a label other than `nsfw` is always stored
together with `nsfw`.

`nsfw` is the label every narrower label implies - anything erotica, ecchi or
a gated type marks is unfit for a public place too - and it is STORED rather
than implied, so a reader asking "does this carry nsfw" never has to know the
rule. Every write path goes through here:

  the label PUT, entry and franchise  routers/content_labels._replace_labels:
                                      with_required_labels + refuse_nsfw_removal
  the gated auto-label                gated_labels.ensure_entry_label /
                                      ensure_franchise_labels
  Pull and Calculate                  gated_labels.enforce_gated_label_invariants
                                      calls add_missing_nsfw

Migration n1s2fwrule34 ran the same backfill once over existing rows.
"""

from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

NSFW = "nsfw"


def with_required_labels(keys: Iterable[str]) -> set[str]:
    """`keys` plus `nsfw` when any other label is among them."""
    out = set(keys)
    if out - {NSFW}:
        out.add(NSFW)
    return out


def refuse_nsfw_removal(old: Iterable[str], new: Iterable[str]) -> None:
    """422 when a write takes `nsfw` off while another label stays on.

    Only a write that HAD nsfw can drop it; a write adding a first label gets
    nsfw added instead (with_required_labels). Removing every label at once is
    fine - nothing then requires nsfw.
    """
    old, new = set(old), set(new)
    others = sorted(new - {NSFW})
    if NSFW in old and NSFW not in new and others:
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{others[0]}' requires 'nsfw'; remove "
                f"{', '.join(repr(k) for k in others)} first, or keep 'nsfw'."
            ),
        )


_ADD_MISSING = {
    "media": """
        INSERT INTO media_content_label (system_id, media_id, label_id, position)
        SELECT gen_random_uuid(), owner.media_id, nsfw.system_id,
               COALESCE(MAX(owner.position), 0) + 1
        FROM media_content_label owner
        JOIN content_label other ON other.system_id = owner.label_id
        CROSS JOIN content_label nsfw
        WHERE other.key <> 'nsfw' AND nsfw.key = 'nsfw'
          AND NOT EXISTS (
              SELECT 1 FROM media_content_label has
              WHERE has.media_id = owner.media_id AND has.label_id = nsfw.system_id
          )
        GROUP BY owner.media_id, nsfw.system_id
    """,
    "franchise": """
        INSERT INTO franchise_content_label
            (system_id, franchise_id, label_id, position)
        SELECT gen_random_uuid(), owner.franchise_id, nsfw.system_id,
               COALESCE(MAX(owner.position), 0) + 1
        FROM franchise_content_label owner
        JOIN content_label other ON other.system_id = owner.label_id
        CROSS JOIN content_label nsfw
        WHERE other.key <> 'nsfw' AND nsfw.key = 'nsfw'
          AND NOT EXISTS (
              SELECT 1 FROM franchise_content_label has
              WHERE has.franchise_id = owner.franchise_id
                AND has.label_id = nsfw.system_id
          )
        GROUP BY owner.franchise_id, nsfw.system_id
    """,
}


def add_missing_nsfw(db: Session) -> dict[str, int]:
    """Attach `nsfw` to every entry and franchise carrying another label
    without it. Idempotent; returns how many of each it added. Does not
    commit - the caller owns the transaction."""
    added = {
        owner: db.execute(text(sql)).rowcount for owner, sql in _ADD_MISSING.items()
    }
    if any(added.values()):
        db.expire_all()
    return added
