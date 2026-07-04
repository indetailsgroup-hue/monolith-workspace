"""Deterministic mock of the LINE Messaging API — LINE OA Commerce (Module B5).

Spec task: 1.1 (scaffold).

Property and integration tests must never hit the real LINE Messaging API. This
mock is fully deterministic: identical inputs and configured behavior always
yield the identical result, and every call is recorded for assertions. It also
captures the access token it was called with so secret-hygiene properties can
confirm the token is resolved correctly yet never leaks elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

SendType = Literal["reply", "push"]


@dataclass
class LineSendRequest:
    send_type: SendType
    messages: list[Any]
    access_token: str
    reply_token: str | None = None
    to: str | None = None


@dataclass
class LineSendResult:
    ok: bool
    status: int
    error_detail: str | None = None


@dataclass
class MockLineMessagingApi:
    """Deterministic, caller-controlled mock of the LINE Messaging API."""

    _ok: bool = True
    _fail_status: int = 0
    _fail_detail: str | None = None
    calls: list[LineSendRequest] = field(default_factory=list)

    def set_ok(self) -> None:
        self._ok = True
        self._fail_status = 0
        self._fail_detail = None

    def set_failure(self, status: int, error_detail: str) -> None:
        self._ok = False
        self._fail_status = status
        self._fail_detail = error_detail

    def reset(self) -> None:
        self.calls.clear()
        self.set_ok()

    @property
    def call_count(self) -> int:
        return len(self.calls)

    def send(self, request: LineSendRequest) -> LineSendResult:
        """Record the call, then return the configured deterministic result."""
        self.calls.append(request)
        if self._ok:
            return LineSendResult(ok=True, status=200)
        return LineSendResult(
            ok=False, status=self._fail_status, error_detail=self._fail_detail
        )
