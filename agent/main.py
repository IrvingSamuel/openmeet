"""OpenMeet copiloto — LiveKit Agents worker (STT + voice wake Copiloto).

Requires:
  pip install -r requirements.txt

Env from ../.env:
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
  DEEPGRAM_API_KEY (optional — without it, agent idles)
  MEET_API_URL, AGENT_SHARED_SECRET
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobRequest,
    WorkerOptions,
    cli,
)
from livekit.agents.stt import SpeechEventType
from livekit.plugins import deepgram

from caption_guards import CrossCaptionDeduper, participant_mic_muted
from copilot_voice import handle_voice_copilot
from wake_word import WakeDebouncer, extract_wake_command, parse_wake_phrases

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

logger = logging.getLogger("openmeet-agent")
logging.basicConfig(level=logging.INFO)

MEET_API_URL = os.getenv("MEET_API_URL", "http://127.0.0.1:3332")
AGENT_SECRET = os.getenv("AGENT_SHARED_SECRET", "")

AGENT_DISPLAY_NAME = "OpenMeet Agent"
AGENT_IDENTITY = "agent-openmeet"

# Voice wake Copiloto
WAKE_DEBOUNCE_SEC = 5.0


def reload_env() -> None:
    """Job subprocesses may start before PM2 env is visible — reload .env."""
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    global MEET_API_URL, AGENT_SECRET
    MEET_API_URL = os.getenv("MEET_API_URL", "http://127.0.0.1:3332")
    AGENT_SECRET = os.getenv("AGENT_SHARED_SECRET", "")


def copilot_wake_enabled() -> bool:
    return os.getenv("COPILOT_WAKE_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def copilot_wake_phrases() -> tuple[str, ...]:
    return parse_wake_phrases(os.getenv("COPILOT_WAKE_PHRASES"))


def deepgram_status() -> str:
    return "ok" if os.getenv("DEEPGRAM_API_KEY") else "missing"


def parse_meeting_id(metadata: str | None) -> Optional[str]:
    if not metadata:
        return None
    try:
        data = json.loads(metadata)
    except Exception:
        return metadata
    if isinstance(data, dict):
        return data.get("meetingId")
    return None


def is_human(participant: rtc.RemoteParticipant) -> bool:
    ident = (participant.identity or "").lower()
    return not (
        ident.startswith("agent-")
        or ident.startswith("agent_")
        or ident == AGENT_IDENTITY
    )


async def persist_segment(
    meeting_id: Optional[str],
    speaker: str,
    text: str,
    livekit_identity: str,
) -> None:
    if not meeting_id or not text.strip():
        return
    payload = {
        "meetingId": meeting_id,
        "speakerLabel": speaker,
        "text": text,
        "isFinal": True,
        "livekitIdentity": livekit_identity,
        "agentSecret": AGENT_SECRET,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{MEET_API_URL}/api/transcripts",
                json=payload,
                headers={"x-agent-secret": AGENT_SECRET},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status >= 400:
                    logger.warning("persist_segment failed: %s", await resp.text())
    except Exception as exc:
        logger.warning("persist_segment error: %s", exc)


async def request_fnc(req: JobRequest) -> None:
    """Stable display name + identity so UI shows 'OpenMeet Agent'."""
    await req.accept(name=AGENT_DISPLAY_NAME, identity=AGENT_IDENTITY)


async def entrypoint(ctx: JobContext) -> None:
    reload_env()
    room_name = ctx.room.name if ctx.room else "?"

    if not os.getenv("DEEPGRAM_API_KEY"):
        logger.warning(
            "DEEPGRAM_API_KEY missing — skipping room %s (deepgram=%s)",
            room_name,
            deepgram_status(),
        )
        ctx.shutdown(reason="deepgram_api_key_missing")
        return

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    meeting_id = parse_meeting_id(ctx.room.metadata)
    logger.info(
        "joined room=%s meeting_id=%s deepgram=%s identity=%s",
        ctx.room.name,
        meeting_id,
        deepgram_status(),
        AGENT_IDENTITY,
    )

    # Wait briefly for meeting metadata before starting STT persistence.
    if not meeting_id:
        for _ in range(15):
            await asyncio.sleep(1)
            meeting_id = parse_meeting_id(ctx.room.metadata)
            if meeting_id:
                logger.info("meeting_id resolved: %s", meeting_id)
                break

    stt = deepgram.STT(
        model="nova-3",
        language="multi",
        keyterm=["Copiloto", "OpenMeet"],
    )
    room = ctx.room
    tasks: set[asyncio.Task] = set()
    transcription_tasks: dict[str, asyncio.Task] = {}
    last_published: dict[str, str] = {}
    cross_deduper = CrossCaptionDeduper()
    active_speaker_identities: set[str] = set()
    wake_phrases = copilot_wake_phrases()
    wake_debouncer = WakeDebouncer(cooldown_sec=WAKE_DEBOUNCE_SEC)
    shutdown_event = asyncio.Event()

    def humans_remaining() -> int:
        return sum(1 for p in room.remote_participants.values() if is_human(p))

    async def try_wake_copilot(
        utterance: str, speaker: str, identity: str
    ) -> None:
        if not copilot_wake_enabled() or not meeting_id:
            return
        match = extract_wake_command(utterance, wake_phrases)
        if not match:
            return
        if not wake_debouncer.allow(identity, time.monotonic()):
            logger.info("wake debounced identity=%s", identity)
            return
        logger.info(
            "wake match phrase=%s command=%s speaker=%s",
            match.wake_phrase,
            match.command,
            speaker,
        )
        await handle_voice_copilot(
            meet_api_url=MEET_API_URL,
            agent_secret=AGENT_SECRET,
            meeting_id=meeting_id,
            speaker=speaker,
            identity=identity,
            command=match.command,
            room=room,
        )

    async def publish_caption(
        speaker: str, text: str, livekit_identity: str
    ) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        participant = room.remote_participants.get(livekit_identity)
        if participant and participant_mic_muted(participant):
            logger.info(
                "skip caption: mic muted identity=%s speaker=%s",
                livekit_identity,
                speaker,
            )
            return
        if active_speaker_identities and livekit_identity not in active_speaker_identities:
            logger.info(
                "skip caption: %s not in active speakers %s",
                livekit_identity,
                active_speaker_identities,
            )
            return
        if not cross_deduper.should_publish(livekit_identity, cleaned):
            logger.info(
                "cross_talk_suppressed speaker=%s identity=%s text=%s",
                speaker,
                livekit_identity,
                cleaned[:80],
            )
            return
        prev = last_published.get(livekit_identity)
        if prev == cleaned:
            return
        last_published[livekit_identity] = cleaned
        payload = json.dumps(
            {
                "speaker": speaker,
                "text": cleaned,
                "participantId": livekit_identity,
                "final": True,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload, reliable=True, topic="captions"
        )
        await persist_segment(meeting_id, speaker, cleaned, livekit_identity)

    async def transcribe_track(
        track: rtc.Track,
        participant: rtc.RemoteParticipant,
        publication: rtc.RemoteTrackPublication,
    ) -> None:
        if not is_human(participant):
            return
        audio_stream = rtc.AudioStream(track)
        stt_stream = stt.stream()
        speaker = participant.name or participant.identity
        identity = participant.identity
        pending_final = ""

        async def pump_audio() -> None:
            nonlocal pending_final
            async for event in audio_stream:
                live = room.remote_participants.get(identity)
                if live is None or participant_mic_muted(live):
                    pending_final = ""
                    continue
                stt_stream.push_frame(event.frame)
            await stt_stream.aclose()

        async def read_transcripts() -> None:
            nonlocal pending_final
            async for ev in stt_stream:
                ev_type = getattr(ev, "type", None)
                alts = getattr(ev, "alternatives", None) or []
                text = ""
                if alts:
                    text = (alts[0].text or "").strip()

                live = room.remote_participants.get(identity)
                if live and participant_mic_muted(live):
                    pending_final = ""
                    continue

                if ev_type == SpeechEventType.FINAL_TRANSCRIPT and text:
                    pending_final = text
                elif ev_type == SpeechEventType.END_OF_SPEECH:
                    to_publish = pending_final or text
                    pending_final = ""
                    if to_publish:
                        if live and participant_mic_muted(live):
                            continue
                        await publish_caption(speaker, to_publish, identity)
                        asyncio.create_task(
                            try_wake_copilot(to_publish, speaker, identity)
                        )
                # Ignore INTERIM_TRANSCRIPT and other event types

        await asyncio.gather(pump_audio(), read_transcripts())

    def start_mic_transcription(
        track: rtc.Track,
        participant: rtc.RemoteParticipant,
        publication: rtc.RemoteTrackPublication,
    ) -> None:
        if publication.source != rtc.TrackSource.SOURCE_MICROPHONE:
            return
        if participant_mic_muted(participant):
            return
        identity = participant.identity
        prev = transcription_tasks.get(identity)
        if prev and not prev.done():
            prev.cancel()
        task = asyncio.create_task(transcribe_track(track, participant, publication))
        transcription_tasks[identity] = task
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    def cancel_mic_transcription(identity: str) -> None:
        task = transcription_tasks.get(identity)
        if task and not task.done():
            task.cancel()
        transcription_tasks.pop(identity, None)

    @room.on("active_speakers_changed")
    def on_active_speakers_changed(speakers: list[rtc.Participant]) -> None:
        active_speaker_identities.clear()
        for p in speakers:
            if not p.identity:
                continue
            if isinstance(p, rtc.RemoteParticipant) and participant_mic_muted(p):
                continue
            active_speaker_identities.add(p.identity)

    @room.on("track_muted")
    def on_track_muted(
        participant: rtc.RemoteParticipant,
        publication: rtc.RemoteTrackPublication,
    ) -> None:
        if publication.source != rtc.TrackSource.SOURCE_MICROPHONE:
            return
        if not is_human(participant):
            return
        cancel_mic_transcription(participant.identity)

    @room.on("track_unmuted")
    def on_track_unmuted(
        participant: rtc.RemoteParticipant,
        publication: rtc.RemoteTrackPublication,
    ) -> None:
        if publication.source != rtc.TrackSource.SOURCE_MICROPHONE:
            return
        if not is_human(participant):
            return
        track = publication.track
        if track is None:
            return
        start_mic_transcription(track, participant, publication)

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if not is_human(participant):
            return
        if publication.source != rtc.TrackSource.SOURCE_MICROPHONE:
            return
        start_mic_transcription(track, participant, publication)

    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        if humans_remaining() == 0:
            logger.info(
                "last human left room=%s — shutting down agent",
                room.name,
            )
            ctx.shutdown(reason="last_human_left")
            shutdown_event.set()

    # Also exit if room already empty at connect time (edge race)
    async def watch_empty() -> None:
        while not shutdown_event.is_set():
            await asyncio.sleep(5)
            if humans_remaining() == 0:
                logger.info("no humans in room=%s — shutting down", room.name)
                ctx.shutdown(reason="no_humans")
                shutdown_event.set()
                return

    # Re-read metadata if it arrives after join
    async def watch_metadata() -> None:
        nonlocal meeting_id
        for _ in range(30):
            if shutdown_event.is_set():
                return
            await asyncio.sleep(2)
            mid = parse_meeting_id(room.metadata)
            if mid and mid != meeting_id:
                meeting_id = mid
                logger.info("meeting_id updated from metadata: %s", meeting_id)
                return
            if meeting_id:
                return

    tasks.add(asyncio.create_task(watch_metadata()))
    tasks.add(asyncio.create_task(watch_empty()))
    await shutdown_event.wait()


if __name__ == "__main__":
    reload_env()
    logger.info(
        "starting openmeet-agent deepgram=%s meet_api=%s",
        deepgram_status(),
        MEET_API_URL,
    )
    ws_url = os.getenv("LIVEKIT_AGENT_URL") or os.getenv("LIVEKIT_URL") or "ws://127.0.0.1:7880"
    if ws_url.startswith("wss://openmeet.chronos.com.pt"):
        ws_url = "ws://127.0.0.1:7880"
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=request_fnc,
            agent_name="",
            port=8095,
            ws_url=ws_url,
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            num_idle_processes=1,
        )
    )
