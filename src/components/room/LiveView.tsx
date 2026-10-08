"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Room, Track, type RoomOptions } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { FixedCaptionsBar, useCaptions } from "@/components/room/Captions";
import { Stage } from "@/components/room/Stage";

/** Headless capture never goes to background; keep every video at full quality. */
const LIVE_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,
};

/** Give the first video frames time to paint before Egress starts encoding. */
const START_SIGNAL_DELAY_MS = 1500;

export function LiveView({
  serverUrl,
  token,
}: {
  serverUrl: string;
  token: string;
}) {
  const [room] = useState(() => new Room(LIVE_ROOM_OPTIONS));

  if (!serverUrl || !token) {
    return <div className="h-screen w-screen bg-black" />;
  }

  return (
    <LiveKitRoom
      room={room}
      serverUrl={serverUrl}
      token={token}
      connect
      audio={false}
      video={false}
      onDisconnected={() => console.log("END_RECORDING")}
      translate="no"
      className="notranslate h-screen w-screen overflow-hidden bg-[#05060f]"
    >
      <LiveViewStage />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function LiveViewStage() {
  const state = useConnectionState();
  const captions = useCaptions(null, { history: false, limit: 20 });
  const screenShares = useTracks([Track.Source.ScreenShare]);
  const signalled = useRef(false);

  useEffect(() => {
    if (state !== ConnectionState.Connected || signalled.current) return;
    const timer = window.setTimeout(() => {
      signalled.current = true;
      console.log("START_RECORDING");
    }, START_SIGNAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 p-[1.2vh] pb-0">
        <Stage
          layout={screenShares.length > 0 ? "spotlight" : "grid"}
          pinnedKey={null}
          readOnly
        />
      </div>
      <FixedCaptionsBar captions={captions} className="h-[12vh] shrink-0" />
    </div>
  );
}
