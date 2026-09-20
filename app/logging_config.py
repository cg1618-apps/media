"""Logging configured once, explicitly, at startup.

Until this file existed the root log level was set by `logging.basicConfig`
running as a side effect of importing one router, so what got logged depended
on which module happened to be imported first, and `basicConfig` is a no-op
once any handler exists. Under a different entrypoint the level silently
differed.

The format is the platform's, not this app's: plain text in development,
JSON lines in production, so the collector on the box indexes fields instead
of regexing sentences. Every application on the box emits the same field
names - `timestamp`, `level`, `logger`, `message`, `app`, `request_id` - and
the contract is in the platform repository's docs; this file implements it.
Nothing here writes a file. The process logs to stdout and the runtime
decides what becomes of it.
"""

import json
import logging
from datetime import datetime, timezone
from logging.config import dictConfig

from app.config import settings
from app.request_context import current_request_id

# The label every line of this app's output carries, and the name the registry
# knows it by in the platform's apps.yml.
APP_NAME = "media"

# Set by RequestIdFilter and consumed by both formatters. Anything logged
# outside a request - startup, migrations, a background task - has none.
_REQUEST_ID_ATTR = "request_id"


class RequestIdFilter(logging.Filter):
    """Attach the current request id to every record passing the handler.

    A filter rather than a formatter, because both formatters need it and a
    record that reaches a handler without the attribute would raise inside
    the logging machinery, where the error is swallowed and the line is lost.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        setattr(record, _REQUEST_ID_ATTR, current_request_id())
        return True


class TextFormatter(logging.Formatter):
    """Development: one readable line, request id only when there is one."""

    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        request_id = getattr(record, _REQUEST_ID_ATTR, None)
        return f"{line} [request_id={request_id}]" if request_id else line


class JsonFormatter(logging.Formatter):
    """Production: one JSON object per line, on stdout."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "app": APP_NAME,
        }
        request_id = getattr(record, _REQUEST_ID_ATTR, None)
        if request_id:
            payload["request_id"] = request_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)
        # default=str, because a log call is not the place to discover that an
        # argument does not serialise - the line matters more than its
        # fidelity. ensure_ascii=False keeps CJK titles readable, which is
        # most of this database.
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure() -> None:
    level = "DEBUG" if settings.is_development else "INFO"
    formatter = "text" if settings.is_development else "json"
    dictConfig(
        {
            "version": 1,
            # False, because uvicorn configures its own loggers before this
            # runs and disabling them would silence every startup line.
            "disable_existing_loggers": False,
            "filters": {"request_id": {"()": RequestIdFilter}},
            "formatters": {
                "text": {
                    "()": TextFormatter,
                    "format": "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
                },
                "json": {"()": JsonFormatter},
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": formatter,
                    "filters": ["request_id"],
                    "stream": "ext://sys.stdout",
                }
            },
            "root": {"handlers": ["console"], "level": level},
            "loggers": {
                "app": {"level": level, "propagate": True},
                # SQLAlchemy's engine logger is WARNING even in development:
                # at INFO it prints every statement, which buries everything
                # else. Turn it up by hand when you are debugging a query.
                "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
                # uvicorn's own loggers are named here so that the access log
                # goes through this handler too. Left alone they keep the
                # handlers uvicorn installed, and the access line - the one
                # record that already knows the path and the status - would be
                # the only thing in the stream that is not JSON and the only
                # thing with no request id.
                "uvicorn": {
                    "handlers": ["console"],
                    "level": level,
                    "propagate": False,
                },
                "uvicorn.error": {
                    "handlers": ["console"],
                    "level": level,
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["console"],
                    "level": level,
                    "propagate": False,
                },
            },
        }
    )
    logging.getLogger(__name__).debug("logging configured at %s in %s format", level, formatter)
