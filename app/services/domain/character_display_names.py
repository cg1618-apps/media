"""
Characters and identities with a Chinese name show it.

display_name_field NULL is the "Default" choice, whose fallback chain puts
English first. While a CN name is filled in, that default is promoted to
"cn"; an explicit en / jp / alt choice is never touched. Runs on every
character and identity create and update (POST and PUT), and over every row
in Calculate All, which catches what reached the tables without a form - a
Pull, a MAL import, a hand edit.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Character, CharacterIdentity


def prefer_cn_display_name(record) -> bool:
    """Point a default display name at name_cn when it is filled. True if changed."""
    if record.display_name_field or not (record.name_cn and record.name_cn.strip()):
        return False
    record.display_name_field = "cn"
    return True


def prefer_cn_display_names(db: Session) -> dict:
    """prefer_cn_display_name over every character and identity; counts per table."""
    counts = {}
    for key, model in (("character", Character), ("identity", CharacterIdentity)):
        counts[key] = (
            db.query(model)
            .filter(
                model.display_name_field.is_(None),
                func.trim(model.name_cn) != "",
            )
            .update({model.display_name_field: "cn"}, synchronize_session="fetch")
        )
    return counts
