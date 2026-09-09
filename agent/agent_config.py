"""Worker/runtime configuration for the OpenMeet agent (env-driven)."""

from __future__ import annotations

import os

from livekit.agents.worker import AgentServer, _DefaultLoadCalc


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def agent_load_threshold() -> float:
    """When effective load exceeds this, worker stops accepting new rooms."""
    return _env_float("AGENT_LOAD_THRESHOLD", 0.85)


def agent_max_concurrent_jobs() -> int:
    """Used by job-based load: treat N active rooms as load=1.0."""
    return max(_env_int("AGENT_MAX_CONCURRENT_JOBS", 4), 1)


def agent_num_idle_processes() -> int:
    return max(_env_int("AGENT_NUM_IDLE_PROCESSES", 1), 0)


def agent_http_port() -> int:
    return _env_int("AGENT_HTTP_PORT", 8095)


def agent_load_mode() -> str:
    """cpu | jobs | hybrid (default hybrid = max(cpu, jobs))."""
    mode = (os.getenv("AGENT_LOAD_MODE") or "hybrid").strip().lower()
    if mode not in ("cpu", "jobs", "hybrid"):
        return "hybrid"
    return mode


def agent_name() -> str:
    """Empty = auto-dispatch every room. Set LIVEKIT_AGENT_NAME for explicit dispatch."""
    return (os.getenv("LIVEKIT_AGENT_NAME") or os.getenv("AGENT_NAME") or "").strip()


def caption_active_speaker_filter_enabled() -> bool:
    """When false (default), do not drop captions for non-dominant active speakers."""
    return (os.getenv("CAPTION_ACTIVE_SPEAKER_FILTER") or "false").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def agent_load_fnc(worker: AgentServer) -> float:
    """Load signal for LiveKit worker availability (0–1).

    Default hybrid mode avoids rejecting jobs when unrelated processes spike host CPU.
    """
    mode = agent_load_mode()
    if mode == "cpu":
        return _DefaultLoadCalc.get_load(worker)

    job_load = len(worker.active_jobs) / agent_max_concurrent_jobs()
    job_load = min(max(job_load, 0.0), 1.0)

    if mode == "jobs":
        return job_load

    cpu_load = _DefaultLoadCalc.get_load(worker)
    return min(max(cpu_load, job_load), 1.0)
