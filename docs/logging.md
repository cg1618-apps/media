# Logging

Last verified: 2026-09-20

What this app writes to its log stream, in what shape, and why it is that
shape. The shape is not this app's choice: it is the platform's contract, in
`cg1618-apps/platform`'s `docs/logging.md`, which every app on the box
implements so that one collector can index all four. This page describes
media's half of it.

## The one rule

**The process logs to stdout and knows nothing else.** No log file, no log
table, no admin log viewer. The runtime decides what becomes of the stream:
in development it is your terminal; in production docker keeps a rolling
window and the collector on the box tails it.

That is also the line between logging and the thing that looks like it: "who
changed this entry", "Pull All rewrote 312 rows" is **domain data**. It
belongs in PostgreSQL and in the UI, and it is not what this page is about.

## What a line looks like

Configured once, at startup, by `app/logging_config.py` — called from
`app/main.py` before anything in that module can log.

**Development** (`APP_ENV=development`), root level `DEBUG`:

```
2026-09-20 14:02:11,884 INFO     app.routers.auth: Successful login for user: admin [request_id=6f1c…]
```

**Production** (anything else, including unset), root level `INFO`: one JSON
object per line.

```json
{"timestamp":"2026-09-20T14:02:11.884+00:00","level":"INFO","logger":"app.routers.auth","message":"Successful login for user: admin","app":"media","request_id":"6f1c…"}
```

| Field | Always | Notes |
|---|---|---|
| `timestamp` | yes | ISO 8601, UTC, milliseconds |
| `level` | yes | `DEBUG`…`CRITICAL` |
| `logger` | yes | the module, e.g. `app.services.pipelines.pull` |
| `message` | yes | after `%s` interpolation |
| `app` | yes | `media` — the name the registry knows this app by |
| `request_id` | inside a request only | omitted, not null, outside one |
| `exc_info` | on an exception | the formatted traceback |

Two levels are pinned rather than inherited: `sqlalchemy.engine` stays at
`WARNING` even in development, because at `INFO` it prints every statement and
buries everything else — turn it up by hand when you are debugging a query.
And `uvicorn`, `uvicorn.error` and `uvicorn.access` have their handlers
**replaced** by this app's, with `propagate` off. Left alone, uvicorn keeps
the handlers it installed at startup, and the access line — the one record
that already knows the path and the status — is the only thing in a production
stream that is not JSON and the only thing with no request id. `docker logs`
looks fine either way, which is what makes it worth asserting in a test.

## The request id

`app/request_context.py`. Every HTTP request gets an id; every line logged
while it is handled carries it; the response carries it back in
`X-Request-ID`. Four apps share one tunnel and one collector, so "IntegrityError"
on its own is worth very little — the id is what turns a failure someone saw
in the browser into the lines that produced it.

- An inbound `X-Request-ID` is honoured **only** if it matches
  `^[A-Za-z0-9_-]{1,64}$`; otherwise it is ignored and a fresh uuid4 hex is
  generated. This app is `public` in `apps.yml` and cloudflared forwards
  client headers unmodified, so the value is attacker-controlled from the open
  internet: unvalidated, a megabyte of junk would ride on every line of that
  request and into the collector, and a caller could deliberately collide ids
  with someone else's request to poison correlation.
- The response echoes the id that was **used**, not the one that arrived.
- It is a `ContextVar`, set by pure ASGI middleware rather than
  `BaseHTTPMiddleware` — that class runs the rest of the application in a task
  of its own, and the variable would then be set in a different context from
  the endpoint that reads it.

## Writing a log call

```python
logger = logging.getLogger(__name__)      # module-level, never configured here
logger.info("Cover image saved: %s", key)
logger.error("Pull failed for %s: %s", tab_name, e, exc_info=True)
```

**`%s` arguments, never an f-string.** It is the standard-library convention
and it costs nothing when the level is off, but the reason it is enforced here
is the JSON formatter: an f-string renders before logging sees it, so the
arguments are gone by the time anything could record them as fields.
`tests/unit/test_logging_config.py::test_no_log_call_formats_its_own_message`
walks `app/` and fails on the first one, so this cannot drift back.

Never log a credential, a token or a connection string — see the platform's
`CLAUDE.md`. A username is fine and is logged on login; a password is not,
including inside an exception being formatted.

## In production

`docker-compose.prod.yml` pins `json-file` with `max-size: 10m` and
`max-file: 5` — about 50 MB per container. The platform sets the same values
as the docker daemon's default, so this block is explicit rather than
load-bearing; what is left in it is the window `docker logs` can reach when
the collector itself is the thing that is down.

```bash
ssh homelab
docker compose -f docker-compose.prod.yml logs -f --tail 100 app   # from ~/anime_site
```

## Tests

- `tests/unit/test_logging_config.py` — the fields, both formatters, the
  uvicorn handover, and the f-string guard (with a mirror case, since a scan
  that finds nothing passes either way).
- `tests/unit/test_request_id.py` — the middleware against a bare app: what is
  generated, what is honoured, and what a caller may not do to it.
- `tests/api/test_request_id_endpoint.py` — that the real application installs
  it. A middleware that is written and never added passes every unit test
  there is.
