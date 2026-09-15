"""Tests for agent_config env helpers."""

from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import patch

from agent_config import (
    agent_load_fnc,
    agent_load_mode,
    agent_load_threshold,
    agent_max_concurrent_jobs,
    caption_active_speaker_filter_enabled,
)


def test_defaults() -> None:
    with patch.dict(os.environ, {}, clear=True):
        assert agent_load_threshold() == 0.85
        assert agent_max_concurrent_jobs() == 4
        assert agent_load_mode() == "hybrid"
        assert caption_active_speaker_filter_enabled() is False


def test_job_load_mode() -> None:
    worker = SimpleNamespace(active_jobs=[1, 2])
    with patch.dict(
        os.environ,
        {"AGENT_LOAD_MODE": "jobs", "AGENT_MAX_CONCURRENT_JOBS": "4"},
        clear=True,
    ):
        assert agent_load_fnc(worker) == 0.5


def test_job_load_caps_at_one() -> None:
    worker = SimpleNamespace(active_jobs=[1, 2, 3, 4, 5])
    with patch.dict(
        os.environ,
        {"AGENT_LOAD_MODE": "jobs", "AGENT_MAX_CONCURRENT_JOBS": "2"},
        clear=True,
    ):
        assert agent_load_fnc(worker) == 1.0
