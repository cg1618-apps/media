"""The real application carries the request id.

tests/unit/test_request_id.py proves the middleware behaves; this proves it is
installed. A middleware that is written and never added passes every unit test
there is.
"""

from app.main import app
from app.request_context import REQUEST_ID_HEADER, RequestIdMiddleware


def test_the_middleware_is_installed():
    assert any(m.cls is RequestIdMiddleware for m in app.user_middleware)


def test_a_real_response_carries_the_header(client):
    response = client.get("/api/health")
    assert REQUEST_ID_HEADER in response.headers


def test_a_refused_response_carries_the_header_too(client):
    """The id matters most on the responses somebody has to investigate.

    A refusal leaves through `HTTPException` rather than through the endpoint,
    which is a different path out of the stack than the health check above -
    and it is the path an investigation actually starts from. This particular
    refusal also logs a line of its own ("Failed login attempt"), so the id in
    the header is the one a reader can then search the stream for.
    """
    response = client.post(
        "/api/auth/login",
        data={"username": "nobody", "password": "anything"},
    )

    assert response.status_code == 401
    assert REQUEST_ID_HEADER in response.headers
