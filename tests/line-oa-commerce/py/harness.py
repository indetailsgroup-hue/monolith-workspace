"""PBT harness (Python / Hypothesis) — LINE OA Commerce (Module B5).

Spec task: 1.1 Scaffold migrations, Edge Functions, and the PBT harness.

This harness drives database-layer property-based tests against the `line_oa_*`
schema and SECURITY DEFINER RPCs over a real DB driver connection. The
Edge-Function / pure-adapter properties live in the TypeScript/fast-check
harness under ``../ts``.

Conventions established here:

1. Property-tag convention. Every property test is tagged with the canonical
   string ``Feature: line-oa-commerce, Property {n}: {text}``. Build it with
   :func:`property_tag` and attach it to a test with the :func:`property`
   decorator (which also stamps a pytest marker for filtering).
2. Default iterations. Property tests run a minimum of 100 iterations. The
   ``line_oa`` Hypothesis profile sets ``max_examples = 100``; activate it with
   :func:`register_and_load_profile` (done automatically by ``conftest.py``).
3. DB driver. :func:`get_connection` returns a connection from the
   ``LINE_OA_TEST_DATABASE_URL`` env var. The actual driver import is lazy so the
   harness can be imported (and the convention unit-tested) without a database.
"""

from __future__ import annotations

import functools
import os
from typing import Any, Callable, TypeVar

from hypothesis import settings

FEATURE = "line-oa-commerce"
"""Feature slug used in every property tag for this module."""

PROPERTY_RUNS = 100
"""Default minimum number of iterations for every property test (spec: >= 100)."""

PROFILE_NAME = "line_oa"
"""Hypothesis profile name carrying the >=100-iteration default."""

_F = TypeVar("_F", bound=Callable[..., Any])


def property_tag(n: int, text: str) -> str:
    """Return the canonical property-tag string.

    >>> property_tag(1, "Signature verification round-trip and rejection")
    'Feature: line-oa-commerce, Property 1: Signature verification round-trip and rejection'
    """
    return f"Feature: {FEATURE}, Property {n}: {text}"


def property(n: int, text: str) -> Callable[[_F], _F]:
    """Decorator binding a test to its canonical property tag.

    Stamps the tag onto the test (``__property_tag__``) and adds it to the
    docstring so it appears in test output, mirroring the TS ``describeProperty``.
    """

    tag = property_tag(n, text)

    def decorate(fn: _F) -> _F:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return fn(*args, **kwargs)

        wrapper.__property_tag__ = tag  # type: ignore[attr-defined]
        wrapper.__doc__ = f"{tag}\n\n{fn.__doc__ or ''}".strip()
        return wrapper  # type: ignore[return-value]

    return decorate


def register_and_load_profile(max_examples: int = PROPERTY_RUNS) -> None:
    """Register and activate the ``line_oa`` Hypothesis profile (>=100 examples)."""
    settings.register_profile(PROFILE_NAME, settings(max_examples=max_examples))
    settings.load_profile(PROFILE_NAME)


def database_url() -> str | None:
    """Return the test database URL, if configured."""
    return os.environ.get("LINE_OA_TEST_DATABASE_URL")


def get_connection() -> Any:
    """Open a DB driver connection for database-layer property tests.

    Uses ``LINE_OA_TEST_DATABASE_URL``. The ``psycopg`` import is intentionally
    lazy so the harness module (and the property-tag convention) can be imported
    and unit-tested without a database or the driver installed. Database-layer
    property tests added by later tasks should ``skip`` when no URL is set.
    """
    url = database_url()
    if not url:
        raise RuntimeError(
            "LINE_OA_TEST_DATABASE_URL is not set; database-layer property tests "
            "require a Postgres connection string."
        )
    import psycopg  # lazy import — only needed when a DB is actually available

    return psycopg.connect(url)
