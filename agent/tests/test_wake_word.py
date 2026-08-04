import time

import pytest

from wake_word import (
    WakeDebouncer,
    extract_wake_command,
    normalize,
    parse_wake_phrases,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Ei Copiloto, qual a pauta?", "qual a pauta"),
        ("Hey copiloto — resume a reunião", "resume a reuniao"),
        ("Oi Copiloto: quem falou sobre contrato?", "quem falou sobre contrato"),
    ],
)
def test_extract_wake_command_positive(text: str, expected: str) -> None:
    match = extract_wake_command(text)
    assert match is not None
    assert match.command == expected


@pytest.mark.parametrize(
    "text",
    [
        "O contrato fecha sexta",
        "Ei copiloto",
        "Hey",
        "",
    ],
)
def test_extract_wake_command_negative(text: str) -> None:
    assert extract_wake_command(text) is None


def test_normalize_strips_accents() -> None:
    assert normalize("Ei Copiloto, qual é a pauta?") == "ei copiloto, qual e a pauta?"


def test_parse_wake_phrases_csv() -> None:
    phrases = parse_wake_phrases("ei copiloto, hey chronos")
    assert phrases == ("ei copiloto", "hey chronos")


def test_wake_debouncer_cooldown() -> None:
    debouncer = WakeDebouncer(cooldown_sec=5.0)
    now = time.monotonic()
    assert debouncer.allow("user-1", now) is True
    assert debouncer.allow("user-1", now + 1) is False
    assert debouncer.allow("user-2", now + 1) is True
    assert debouncer.allow("user-1", now + 6) is True
