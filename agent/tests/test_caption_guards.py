import time

from livekit import rtc

from caption_guards import (
    CrossCaptionDeduper,
    normalize_text,
    participant_mic_muted,
    texts_similar,
)


class MockPub:
    def __init__(self, source: int, muted: bool) -> None:
        self.source = source
        self.muted = muted


class MockParticipant:
    def __init__(self, pubs: list[MockPub]) -> None:
        self.track_publications = {str(i): p for i, p in enumerate(pubs)}


def test_normalize_text() -> None:
    assert normalize_text("  Olá,   mundo!  ") == "olá mundo"


def test_texts_similar_identical() -> None:
    assert texts_similar("bom dia", "bom dia")


def test_texts_similar_close() -> None:
    assert texts_similar("vamos alinhar a pauta", "vamos alinhar a pauta hoje")


def test_texts_similar_different() -> None:
    assert not texts_similar("contrato fecha sexta", "preciso de café")


def test_cross_caption_deduper_allows_first() -> None:
    deduper = CrossCaptionDeduper(window_sec=3.0)
    assert deduper.should_publish("user_a", "bom dia", now=100.0)


def test_cross_caption_deduper_blocks_bleed() -> None:
    deduper = CrossCaptionDeduper(window_sec=3.0)
    now = 100.0
    assert deduper.should_publish("user_a", "bom dia a todos", now=now)
    assert not deduper.should_publish("user_b", "bom dia a todos", now=now + 1.0)


def test_cross_caption_deduper_allows_after_window() -> None:
    deduper = CrossCaptionDeduper(window_sec=2.0)
    now = 100.0
    assert deduper.should_publish("user_a", "ok entendi", now=now)
    assert deduper.should_publish("user_b", "ok entendi", now=now + 3.0)


def test_cross_caption_deduper_same_identity_not_blocked() -> None:
    deduper = CrossCaptionDeduper(window_sec=3.0)
    now = 100.0
    assert deduper.should_publish("user_a", "primeira frase", now=now)
    assert deduper.should_publish("user_a", "segunda frase", now=now + 0.5)


def test_participant_mic_muted_no_mic() -> None:
    p = MockParticipant([])
    assert participant_mic_muted(p) is True


def test_participant_mic_muted_when_muted() -> None:
    p = MockParticipant(
        [MockPub(rtc.TrackSource.SOURCE_MICROPHONE, True)],
    )
    assert participant_mic_muted(p) is True


def test_participant_mic_muted_when_unmuted() -> None:
    p = MockParticipant(
        [MockPub(rtc.TrackSource.SOURCE_MICROPHONE, False)],
    )
    assert participant_mic_muted(p) is False


def test_participant_mic_ignores_screen_share() -> None:
    p = MockParticipant(
        [
            MockPub(rtc.TrackSource.SOURCE_SCREENSHARE, False),
            MockPub(rtc.TrackSource.SOURCE_MICROPHONE, True),
        ],
    )
    assert participant_mic_muted(p) is True
