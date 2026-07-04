"""Harness smoke test — LINE OA Commerce (Module B5). Spec task: 1.1 (scaffold).

Verifies the Python PBT harness scaffolding is wired up and discoverable by
pytest/Hypothesis:
  * the property-tag convention produces the canonical string,
  * the ``property`` decorator stamps the tag,
  * the >=100-iteration profile is active,
  * the deterministic LINE Messaging API mock records calls,
  * the ``record_input_sync`` spy/stub records calls and honors outcomes.

This is a scaffold check, not a feature property test. Real database-layer
property tests (e.g. Properties 27, 30, 31) are added by later tasks.
"""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

import harness
from harness import PROPERTY_RUNS, property, property_tag
from mocks.line_messaging_api import LineSendRequest
from mocks.record_input_sync import MockRecordInputSync


def test_property_tag_is_canonical() -> None:
    assert (
        property_tag(1, "Signature verification round-trip and rejection")
        == "Feature: line-oa-commerce, Property 1: Signature verification round-trip and rejection"
    )
    assert harness.FEATURE == "line-oa-commerce"


def test_property_decorator_stamps_tag() -> None:
    @property(30, "Audit log is immutable")
    def sample() -> None:
        return None

    assert sample.__property_tag__ == "Feature: line-oa-commerce, Property 30: Audit log is immutable"
    assert "Property 30" in (sample.__doc__ or "")


def test_default_profile_runs_at_least_100() -> None:
    assert PROPERTY_RUNS >= 100
    assert settings().max_examples >= 100


def test_line_api_mock_is_deterministic(line_api) -> None:
    res = line_api.send(
        LineSendRequest(send_type="push", messages=[], access_token="tok_test", to="U1")
    )
    assert res.ok is True
    assert line_api.call_count == 1

    line_api.set_failure(429, "rate_limited")
    fail = line_api.send(
        LineSendRequest(send_type="reply", messages=[], access_token="tok_test", reply_token="r1")
    )
    assert fail.ok is False
    assert fail.error_detail == "rate_limited"
    assert "tok_test" not in (fail.error_detail or "")


def test_record_input_sync_spy(record_input_sync: MockRecordInputSync) -> None:
    record_input_sync.record_input_sync("line", "BKK-SUK-01", {"orders": 3})
    assert record_input_sync.call_count == 1
    assert record_input_sync.calls[0].sync_source == "line"
    assert record_input_sync.calls[0].site_code == "BKK-SUK-01"

    record_input_sync.set_failure("downstream_unavailable")
    out = record_input_sync.record_input_sync("line", "BKK-SUK-01", {})
    assert out == {"ok": False, "reason": "downstream_unavailable"}


@given(st.integers())
@settings(max_examples=PROPERTY_RUNS)
def test_hypothesis_runs(n: int) -> None:
    """Sanity check that Hypothesis itself is wired up."""
    assert n == n
