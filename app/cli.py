"""
Commands run on the box, inside the app container.

    docker compose exec media-app python -m app.cli reset-link <username>

`reset-link` is the way back in when nobody can sign in to /users - the admin
included. It issues the same one-time link the Users page does
(app/services/domain/account_codes.py), with no issuer recorded, and prints
it with its expiry. Exit 0 with the link; exit 1 with a message on stderr for
an unknown account, or one that may not have a link (not active, or shared).

Needs only the database: the link's host comes from settings.public_base_url,
since there is no request to read one from.
"""

import argparse
import sys
from typing import Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.domain.account_codes import issue_reset_link, reset_refusal


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    reset = commands.add_parser(
        "reset-link", help="Print a one-time password reset link for an account."
    )
    reset.add_argument("username")
    return parser


def _reset_link(db: Session, username: str) -> int:
    user = (
        db.query(models.User)
        .filter(func.lower(models.User.username) == username.lower())
        .first()
    )
    if user is None:
        print(f"No account is called {username!r}.", file=sys.stderr)
        return 1
    refusal = reset_refusal(user)
    if refusal:
        print(f"{user.username}: {refusal}", file=sys.stderr)
        return 1
    link, expires_at = issue_reset_link(db, user, created_by_id=None)
    db.commit()
    print(f"Reset link for {user.username}:")
    print(link)
    print(f"Valid until {expires_at.isoformat(timespec='minutes')}. It works once.")
    return 0


def run(db: Session, argv: Optional[Sequence[str]] = None) -> int:
    """Parse `argv` and run the command against `db`. Returns the exit code.

    Separate from main() so a test can hand in its own session."""
    args = _parser().parse_args(argv)
    if args.command == "reset-link":
        return _reset_link(db, args.username)
    return 2  # pragma: no cover - argparse refuses an unknown command first


def main(argv: Optional[Sequence[str]] = None) -> int:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        return run(db, argv)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
