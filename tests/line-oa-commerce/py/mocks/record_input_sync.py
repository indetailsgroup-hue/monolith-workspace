"""Spy/stub mock of ``record_input_sync`` (forecasting pipeline) —
LINE OA Commerce (Module B5). Spec task: 1.1 (scaffold).

The forecasting contract (``record_input_sync`` writing the append-only
``forecast_input_sync_log``) is owned elsewhere and must NOT be redefined by this
module. For tests we use a spy/stub that records each invocation so we can assert
``Sync_Source='line'``, the associated ``site_code``, append-only behavior, and
failure handling — without touching the real pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RecordInputSyncCall:
    sync_source: str
    site_code: str
    payload: Any


@dataclass
class MockRecordInputSync:
    """Spy/stub mirroring ``record_input_sync(Sync_Source, site_code, ...)``."""

    _ok: bool = True
    _fail_reason: str | None = None
    calls: list[RecordInputSyncCall] = field(default_factory=list)

    def set_ok(self) -> None:
        self._ok = True
        self._fail_reason = None

    def set_failure(self, reason: str) -> None:
        self._ok = False
        self._fail_reason = reason

    def reset(self) -> None:
        self.calls.clear()
        self.set_ok()

    @property
    def call_count(self) -> int:
        return len(self.calls)

    def record_input_sync(self, sync_source: str, site_code: str, payload: Any) -> dict[str, Any]:
        """Record the call (spy) and return the configured outcome (stub)."""
        self.calls.append(
            RecordInputSyncCall(sync_source=sync_source, site_code=site_code, payload=payload)
        )
        if self._ok:
            return {"ok": True}
        return {"ok": False, "reason": self._fail_reason}
