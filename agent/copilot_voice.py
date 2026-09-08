"""Voice-triggered Copiloto: call Meet API and broadcast to clients."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

import aiohttp
from livekit import rtc

logger = logging.getLogger("openmeet-agent")


async def post_voice_copilot_chat(
    *,
    meet_api_url: str,
    agent_secret: str,
    meeting_id: str,
    message: str,
    display_name: str,
    livekit_identity: str,
) -> Optional[dict[str, Any]]:
    payload = {
        "meetingId": meeting_id,
        "message": message,
        "displayName": display_name,
        "livekitIdentity": livekit_identity,
        "source": "voice",
        "agentSecret": agent_secret,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{meet_api_url}/api/meetings/copilot/chat",
                json=payload,
                headers={"x-agent-secret": agent_secret},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status >= 400:
                    logger.warning(
                        "voice copilot chat failed: %s %s",
                        resp.status,
                        await resp.text(),
                    )
                    return None
                return await resp.json()
    except Exception as exc:
        logger.warning("voice copilot chat error: %s", exc)
        return None


async def publish_voice_exchange(
    room: rtc.Room,
    result: dict[str, Any],
) -> None:
    user_msg = result.get("userMessage")
    assistant_msg = result.get("assistantMessage")
    if not user_msg or not assistant_msg:
        return
    payload = json.dumps(
        {
            "type": "voice_exchange",
            "userMessage": user_msg,
            "assistantMessage": assistant_msg,
            "at": int(time.time() * 1000),
        }
    ).encode("utf-8")
    await room.local_participant.publish_data(
        payload, reliable=True, topic="copilot-voice"
    )
    logger.info(
        "copilot-voice published user=%s",
        (user_msg.get("authorName") or "?"),
    )


async def handle_voice_copilot(
    *,
    meet_api_url: str,
    agent_secret: str,
    meeting_id: str,
    speaker: str,
    identity: str,
    command: str,
    room: rtc.Room,
) -> None:
    result = await post_voice_copilot_chat(
        meet_api_url=meet_api_url,
        agent_secret=agent_secret,
        meeting_id=meeting_id,
        message=command,
        display_name=speaker,
        livekit_identity=identity,
    )
    if not result:
        return
    await publish_voice_exchange(room, result)
