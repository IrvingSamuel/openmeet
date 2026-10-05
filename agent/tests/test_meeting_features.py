"""Tests for per-meeting AI feature flag parsing."""

from __future__ import annotations

from meeting_features import ALL_ON, MeetingFeatures, parse_features


def test_missing_payload_defaults_to_all_on() -> None:
    assert parse_features(None) == ALL_ON
    assert parse_features("nope") == ALL_ON
    assert parse_features({}) == ALL_ON
    assert ALL_ON.agent_required is True


def test_explicit_flags() -> None:
    f = parse_features({"captions": False, "transcription": True, "summary": False})
    assert f == MeetingFeatures(captions=False, transcription=True, summary=False)
    assert f.agent_required is True


def test_malformed_flags_default_to_on() -> None:
    f = parse_features({"captions": "false", "transcription": 0, "summary": None})
    assert f == ALL_ON


def test_summary_requires_transcription() -> None:
    f = parse_features({"captions": True, "transcription": False, "summary": True})
    assert f.summary is False
    assert f.agent_required is True


def test_agent_not_required_when_captions_and_transcription_off() -> None:
    f = parse_features({"captions": False, "transcription": False})
    assert f.agent_required is False
