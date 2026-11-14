"""
The username and password checks every NEW credential passes.

The password half is deliberately not a policy - no minimum length, no
composition rules, by the owner's decision. What remains is technical: an
empty string is no credential, and bcrypt reads only the first 72 bytes, so a
longer password is refused rather than silently truncated.
"""

import bcrypt
import pytest

from app.services.security import (
    get_password_hash,
    validate_new_password,
    validate_new_username,
    verify_password,
)

# ---------------------------------------------------------------------------
# Usernames
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    ["kai", "adamin", "adm1in", "a_b-c", "x" * 32, "123", "guesst", "admn"],
)
def test_these_usernames_are_allowed(name):
    assert validate_new_username(name) == name


@pytest.mark.parametrize(
    "name",
    [
        "admin1",  # the spec's own examples
        "qadminqe",
        "gUesT",
        "admin",
        "guest",
        "my_guest",
    ],
)
def test_a_name_containing_admin_or_guest_is_refused(name):
    with pytest.raises(ValueError):
        validate_new_username(name)


@pytest.mark.parametrize(
    "name",
    ["Kai", "ab", "x" * 33, "with space", "dot.name", "", "kai!", "ñandu"],
)
def test_a_name_outside_the_pattern_is_refused(name):
    with pytest.raises(ValueError):
        validate_new_username(name)


def test_the_reserved_check_reads_the_lowercased_name():
    """`gUesT` fails the pattern too, so this pins the substring rule on its
    own: the message names the reserved words, not the character set."""
    with pytest.raises(ValueError, match="admin"):
        validate_new_username("ADMINX")


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def test_an_empty_password_is_refused():
    with pytest.raises(ValueError):
        validate_new_password("")


def test_a_one_character_password_is_accepted():
    validate_new_password("x")


def test_exactly_72_bytes_is_accepted():
    validate_new_password("a" * 72)


def test_73_bytes_of_multibyte_text_is_refused():
    """25 characters, 73 bytes: a character count would wave this through."""
    password = "é" * 36 + "a"  # 36 * 2 + 1 = 73 bytes
    assert len(password) == 37
    assert len(password.encode("utf-8")) == 73
    with pytest.raises(ValueError, match="72"):
        validate_new_password(password)


def test_hashing_no_longer_truncates():
    """A password past 72 bytes is refused before it is hashed; the hash
    function itself refuses rather than quietly cutting it short."""
    with pytest.raises(ValueError):
        get_password_hash("a" * 73)


def test_an_existing_hash_of_an_80_byte_password_still_verifies():
    """Accounts set before the policy were hashed from the first 72 bytes.
    verify_password keeps its own slice so they still sign in."""
    password = "p" * 80
    legacy_hash = bcrypt.hashpw(
        password.encode("utf-8")[:72], bcrypt.gensalt()
    ).decode("utf-8")
    assert verify_password(password, legacy_hash) is True
    assert verify_password("q" * 80, legacy_hash) is False
