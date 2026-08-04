"""Wake phrase detection for voice-activated Copiloto commands."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

DEFAULT_WAKE_PHRASES = ("ei copiloto", "hey copiloto", "oi copiloto", "copiloto")
MIN_COMMAND_LEN = 3


@dataclass(frozen=True)
class WakeMatch:
    command: str
    wake_phrase: str
    raw: str


def normalize(text: str) -> str:
    lowered = text.strip().lower()
    decomposed = unicodedata.normalize("NFD", lowered)
    without_accents = "".join(
        ch for ch in decomposed if unicodedata.category(ch) != "Mn"
    )
    collapsed = re.sub(r"\s+", " ", without_accents)
    return collapsed.strip()


def parse_wake_phrases(raw: str | None) -> tuple[str, ...]:
    if not raw or not raw.strip():
        return DEFAULT_WAKE_PHRASES
    parts = [normalize(p) for p in raw.split(",") if p.strip()]
    return tuple(parts) if parts else DEFAULT_WAKE_PHRASES


def _strip_command_suffix(text: str) -> str:
    cleaned = text.strip(" \t.,!?;:-—")
    return cleaned.strip()


def extract_wake_command(
    text: str,
    phrases: tuple[str, ...] | list[str] | None = None,
) -> WakeMatch | None:
    """Return command text if utterance contains a wake phrase with a question."""
    raw = text.strip()
    if not raw:
        return None

    normalized = normalize(raw)
    if not normalized:
        return None

    wake_list = tuple(phrases) if phrases else DEFAULT_WAKE_PHRASES
    sorted_phrases = sorted(
        (normalize(p) for p in wake_list if p.strip()),
        key=len,
        reverse=True,
    )

    for phrase in sorted_phrases:
        if not phrase:
            continue

        # Wake phrase at start: "ei copiloto, qual a pauta?"
        if normalized.startswith(phrase):
            remainder = normalized[len(phrase) :]
            remainder = re.sub(r"^[\s,;:\-—]+", "", remainder)
            command = _strip_command_suffix(remainder)
            if len(command) >= MIN_COMMAND_LEN:
                return WakeMatch(command=command, wake_phrase=phrase, raw=raw)
            continue

        # Wake phrase after sentence break: "... ok, ei copiloto, qual a pauta?"
        pattern = rf"(?:^|[,.;:\-—]\s*){re.escape(phrase)}(?:[\s,;:\-—]+|$)"
        match = re.search(pattern, normalized)
        if not match:
            continue
        remainder = normalized[match.end() :]
        remainder = re.sub(r"^[\s,;:\-—]+", "", remainder)
        command = _strip_command_suffix(remainder)
        if len(command) >= MIN_COMMAND_LEN:
            return WakeMatch(command=command, wake_phrase=phrase, raw=raw)

    return None


class WakeDebouncer:
    """Per-participant cooldown to avoid duplicate voice activations."""

    def __init__(self, cooldown_sec: float = 5.0) -> None:
        self._cooldown_sec = cooldown_sec
        self._last_at: dict[str, float] = {}

    def allow(self, identity: str, now: float) -> bool:
        prev = self._last_at.get(identity)
        if prev is not None and (now - prev) < self._cooldown_sec:
            return False
        self._last_at[identity] = now
        return True

    def reset(self, identity: str | None = None) -> None:
        if identity is None:
            self._last_at.clear()
        else:
            self._last_at.pop(identity, None)
