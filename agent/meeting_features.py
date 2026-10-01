"""Per-meeting AI feature flags served by GET /api/agent/config?room=."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class MeetingFeatures:
    captions: bool = True
    transcription: bool = True
    summary: bool = True

    @property
    def agent_required(self) -> bool:
        return self.captions or self.transcription


ALL_ON = MeetingFeatures()


def _flag(raw: Any) -> bool:
    return raw if isinstance(raw, bool) else True


def parse_features(raw: Any) -> MeetingFeatures:
    """Missing or malformed flags default to on so an API hiccup never mutes captions."""
    if not isinstance(raw, dict):
        return ALL_ON
    transcription = _flag(raw.get("transcription"))
    return MeetingFeatures(
        captions=_flag(raw.get("captions")),
        transcription=transcription,
        summary=transcription and _flag(raw.get("summary")),
    )
