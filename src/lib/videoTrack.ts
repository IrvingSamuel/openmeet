/**
 * Whether a LiveKit tile should mount <VideoTrack>.
 * Must NOT require `publication.track` — adaptiveStream only starts once a
 * <video> element is attached, so gating on track creates a chicken-and-egg.
 */
export function shouldRenderVideoTrack(opts: {
  isTrackReference: boolean;
  isMuted: boolean;
}): boolean {
  return opts.isTrackReference && !opts.isMuted;
}
