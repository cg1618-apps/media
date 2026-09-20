"""The logging contract: what a line looks like, and who emits it.

The platform's docs/logging.md is the contract these assert. It is shared by
every app on the box, so a change here is a change to what the collector can
index - not a change to this app's taste.
"""

import ast
import json
import logging
import pathlib
import sys
from datetime import datetime, timezone

import pytest

from app import logging_config
from app.logging_config import APP_NAME, JsonFormatter, RequestIdFilter, TextFormatter
from app.request_context import reset_request_id, set_request_id

APP_DIR = pathlib.Path(__file__).resolve().parents[2] / "app"
LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical", "log"}


@pytest.fixture(autouse=True)
def restore_root_logging():
    """configure() is global. Put the suite's logging back afterwards.

    Without this, the first test here leaves every later test in the run
    emitting production JSON through a handler this module installed - which
    is harmless until the day it is not, and impossible to attribute when it
    happens.
    """
    root = logging.getLogger()
    saved = (root.handlers[:], root.level)
    saved_uvicorn = {
        name: (
            logging.getLogger(name).handlers[:],
            logging.getLogger(name).propagate,
            logging.getLogger(name).level,
        )
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access")
    }
    yield
    root.handlers[:], root.level = saved
    for name, (handlers, propagate, level) in saved_uvicorn.items():
        restored = logging.getLogger(name)
        restored.handlers[:] = handlers
        restored.propagate = propagate
        restored.level = level


def make_record(message="hello", args=(), level=logging.INFO, exc_info=None):
    record = logging.LogRecord(
        name="app.something",
        level=level,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=args,
        exc_info=exc_info,
    )
    RequestIdFilter().filter(record)
    return record


@pytest.fixture
def request_id():
    """Enter a request, and leave it however the test ends."""
    token = set_request_id("abc123")
    yield "abc123"
    reset_request_id(token)


# ---------------------------------------------------------------------------
# The JSON line
# ---------------------------------------------------------------------------


def test_json_line_carries_every_contract_field():
    payload = json.loads(JsonFormatter().format(make_record()))

    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.something"
    assert payload["message"] == "hello"
    assert payload["app"] == APP_NAME
    # ISO 8601 and UTC, parsed as such rather than merely string-shaped.
    parsed = datetime.fromisoformat(payload["timestamp"])
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(None)


def test_json_line_interpolates_lazy_arguments():
    payload = json.loads(JsonFormatter().format(make_record("id %s", args=(7,))))
    assert payload["message"] == "id 7"


def test_json_request_id_is_present_inside_a_request(request_id):
    payload = json.loads(JsonFormatter().format(make_record()))
    assert payload["request_id"] == request_id


def test_json_request_id_is_absent_outside_a_request():
    # The mirror of the test above, and the one that bites: a formatter
    # writing `"request_id": null` on every startup line would pass the first
    # test and quietly pad every line the collector stores.
    payload = json.loads(JsonFormatter().format(make_record()))
    assert "request_id" not in payload


def test_json_line_carries_the_traceback():
    try:
        raise ValueError("boom")
    except ValueError:
        record = make_record(level=logging.ERROR, exc_info=sys.exc_info())
    payload = json.loads(JsonFormatter().format(record))
    assert "ValueError: boom" in payload["exc_info"]


def test_json_line_survives_an_unserialisable_argument():
    class Opaque:
        def __repr__(self):
            return "<opaque>"

    payload = json.loads(JsonFormatter().format(make_record("%s", args=(Opaque(),))))
    assert payload["message"] == "<opaque>"


def test_json_line_is_one_line():
    """A newline in a message must not become two log lines.

    The collector splits the stream on newlines, so a multi-line message
    would arrive as one parseable line followed by garbage.
    """
    line = JsonFormatter().format(make_record("first\nsecond"))
    assert "\n" not in line
    assert json.loads(line)["message"] == "first\nsecond"


# ---------------------------------------------------------------------------
# The development line
# ---------------------------------------------------------------------------


def test_text_line_names_the_request(request_id):
    line = TextFormatter("%(message)s").format(make_record())
    assert line == f"hello [request_id={request_id}]"


def test_text_line_says_nothing_outside_a_request():
    assert TextFormatter("%(message)s").format(make_record()) == "hello"


# ---------------------------------------------------------------------------
# configure()
# ---------------------------------------------------------------------------


def formatter_after_configure(monkeypatch, *, development):
    monkeypatch.setattr(
        type(logging_config.settings),
        "is_development",
        property(lambda self: development),
    )
    logging_config.configure()
    return logging.getLogger().handlers[0].formatter


def test_production_gets_json(monkeypatch):
    formatter = formatter_after_configure(monkeypatch, development=False)
    assert isinstance(formatter, JsonFormatter)


def test_development_gets_text(monkeypatch):
    formatter = formatter_after_configure(monkeypatch, development=True)
    assert isinstance(formatter, TextFormatter)


def test_uvicorns_own_loggers_are_taken_over(monkeypatch):
    """uvicorn installs its own handlers and stops propagation.

    Left alone, the access log - the one record that already knows the path
    and the status - is the only thing in a production stream that is not
    JSON and the only thing with no request id, and `docker logs` looks fine
    either way. So the handover is asserted rather than assumed.
    """
    formatter_after_configure(monkeypatch, development=False)
    console = logging.getLogger().handlers[0]

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        taken_over = logging.getLogger(name)
        assert taken_over.handlers == [console], name
        # propagate stays False: uvicorn's handler replaced AND propagation on
        # would emit every access line twice.
        assert taken_over.propagate is False, name


def test_sqlalchemy_statements_stay_quiet_in_development(monkeypatch):
    formatter_after_configure(monkeypatch, development=True)
    assert logging.getLogger("sqlalchemy.engine").level == logging.WARNING


# ---------------------------------------------------------------------------
# The convention, enforced
# ---------------------------------------------------------------------------


def f_string_log_calls(tree, source_name):
    """Every `logger.<level>(f"...")` in one parsed module."""
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (
            isinstance(func, ast.Attribute)
            and func.attr in LOG_METHODS
            and isinstance(func.value, ast.Name)
            and func.value.id == "logger"
        ):
            continue
        if node.args and isinstance(node.args[0], ast.JoinedStr):
            found.append(f"{source_name}:{node.lineno}")
    return found


def test_no_log_call_formats_its_own_message():
    """`logger.info("x %s", y)`, never `logger.info(f"x {y}")`.

    The template stays constant, so one message groups however its arguments
    vary; the interpolation is skipped when the level is off; and `record.args`
    stays populated, so emitting a field per argument later is a change to one
    formatter rather than a rewrite of every call site. What it is NOT is
    cheaper to render - both formatters above call `record.getMessage()`,
    which treats the two identically.

    Asserted rather than left to taste because there were 85 call sites doing
    it the other way before this test existed.
    """
    offenders = []
    for path in sorted(APP_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        offenders += f_string_log_calls(tree, path.relative_to(APP_DIR.parent))
    assert offenders == []


def test_the_f_string_guard_can_actually_fail():
    """The mirror case: a scan of a tree can pass by finding nothing.

    `app/` will always hold some logger call - but "always" is what an
    empty-set assertion sounds like right up to the refactor that empties it.
    So prove the detector fires on a known-bad module.
    """
    bad = ast.parse('logger.info(f"value {x}")\n')
    assert f_string_log_calls(bad, "bad.py") == ["bad.py:1"]
