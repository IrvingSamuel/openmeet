"""Guards against duplicate cross-participant caption attribution (mic bleed)."""

from __future__ import annotations

import re
import time
from difflib import SequenceMatcher

from livekit import rtc

DEFAULT_WINDOW_SEC = 3.0
DEFAULT_SIMILARITY_THRESHOLD = 0.85


def participant_mic_muted(participant: rtc.RemoteParticipant) -> bool:
    """True when every published microphone track is muted (or none exist)."""
    found = False
    for pub in participant.track_publications.values():
        if pub.source != rtc.TrackSource.SOURCE_MICROPHONE:
            continue
        found = True
        if not pub.muted:
            return False
    return True
DEFAULT_SIMILARITY_THRESHOLD = 0.85


def normalize_text(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s]", "", t, flags=re.UNICODE)
    return t


def texts_similar(
    a: str,
    b: str,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> bool:
    na = normalize_text(a)
    nb = normalize_text(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= threshold


class CrossCaptionDeduper:
    """Suppress near-duplicate captions from different identities within a time window."""

    def __init__(
        self,
        window_sec: float = DEFAULT_WINDOW_SEC,
        threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> None:
        self.window_sec = window_sec
        self.threshold = threshold
        self._last_text = ""
        self._last_identity = ""
        self._last_time = 0.0

    def should_publish(
        self,
        identity: str,
        text: str,
        now: float | None = None,
    ) -> bool:
        cleaned = text.strip()
        if not cleaned:
            return False

        t = now if now is not None else time.monotonic()
        if (
            self._last_identity
            and identity != self._last_identity
            and t - self._last_time <= self.window_sec
            and texts_similar(cleaned, self._last_text, self.threshold)
        ):
            return False

        self._last_text = cleaned
        self._last_identity = identity
        self._last_time = t
        return True
