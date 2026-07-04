"""Pytest configuration for the LINE OA Commerce Python PBT harness.

Spec task: 1.1 (scaffold). Loads the >=100-iteration Hypothesis profile and
exposes the deterministic mocks as fixtures.
"""

from __future__ import annotations

import pytest

from harness import register_and_load_profile
from mocks.line_messaging_api import MockLineMessagingApi
from mocks.record_input_sync import MockRecordInputSync

# Activate the line_oa Hypothesis profile (max_examples >= 100) for the session.
register_and_load_profile()


@pytest.fixture
def line_api() -> MockLineMessagingApi:
    """Fresh deterministic LINE Messaging API mock per test."""
    return MockLineMessagingApi()


@pytest.fixture
def record_input_sync() -> MockRecordInputSync:
    """Fresh record_input_sync spy/stub per test."""
    return MockRecordInputSync()
