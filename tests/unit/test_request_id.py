"""The request id: where it comes from, and what a caller may not do to it.

Driven against a bare Starlette app rather than this one, so the middleware
is tested without a database and without the rest of the application's
startup. That the real app actually installs it is asserted in
tests/api/test_request_id_endpoint.py - the two halves are separate because
the failure modes are: one is "the middleware is wrong", the other is "the
middleware is not there".
"""

import re

from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.request_context import REQUEST_ID_HEADER, RequestIdMiddleware, current_request_id


async def report(request):
    """Answer with the id the handler itself can see."""
    return JSONResponse({"seen": current_request_id()})


def make_client():
    app = Starlette(routes=[Route("/", report)])
    app.add_middleware(RequestIdMiddleware)
    return TestClient(app)


def test_a_request_without_an_id_is_given_one():
    response = make_client().get("/")

    assigned = response.headers[REQUEST_ID_HEADER]
    assert re.fullmatch(r"[0-9a-f]{32}", assigned)
    # The header and the handler agree. A middleware that generated one id for
    # the response and another for the context would look right from outside
    # and correlate nothing.
    assert response.json()["seen"] == assigned


def test_two_requests_get_different_ids():
    client = make_client()
    first = client.get("/").headers[REQUEST_ID_HEADER]
    second = client.get("/").headers[REQUEST_ID_HEADER]
    assert first != second


def test_a_caller_supplied_id_is_honoured():
    """So a trace that starts at the edge keeps one id through the app."""
    response = make_client().get("/", headers={REQUEST_ID_HEADER: "edge-0123"})

    assert response.headers[REQUEST_ID_HEADER] == "edge-0123"
    assert response.json()["seen"] == "edge-0123"


def test_the_id_does_not_leak_between_requests():
    client = make_client()
    client.get("/", headers={REQUEST_ID_HEADER: "edge-0123"})
    assert current_request_id() is None


# ---------------------------------------------------------------------------
# What a caller may not do
# ---------------------------------------------------------------------------
#
# media is `public` in the platform's apps.yml and cloudflared forwards client
# headers unmodified, so this header is attacker-controlled from the open
# internet. JSON encoding stops it forging a line; these stop it making every
# line of a request expensive or unattributable.


def test_an_overlong_id_is_replaced():
    response = make_client().get("/", headers={REQUEST_ID_HEADER: "x" * 65})

    returned = response.headers[REQUEST_ID_HEADER]
    assert re.fullmatch(r"[0-9a-f]{32}", returned)
    # Echoing what arrived would put the caller's payload back on the wire and
    # on every line logged for this request.
    assert "x" * 65 not in returned


def test_an_id_with_punctuation_is_replaced():
    response = make_client().get("/", headers={REQUEST_ID_HEADER: 'a" {"level":"INFO"'})
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers[REQUEST_ID_HEADER])


def test_an_empty_id_is_replaced():
    response = make_client().get("/", headers={REQUEST_ID_HEADER: ""})
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers[REQUEST_ID_HEADER])


def test_the_longest_acceptable_id_is_still_accepted():
    """The mirror of the rejection tests above.

    Without it, a validator that rejected everything - a regex typo, an
    inverted condition - would pass every test in this section, because
    "generate a fresh one" is what they all assert.
    """
    at_the_limit = "a" * 64
    response = make_client().get("/", headers={REQUEST_ID_HEADER: at_the_limit})
    assert response.headers[REQUEST_ID_HEADER] == at_the_limit
