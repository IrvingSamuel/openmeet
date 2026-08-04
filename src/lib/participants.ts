import type { Participant } from "livekit-client";

/** Agents (copiloto) must not take a camera tile or inflate the people count. */
export function isAgentParticipant(participant: {
  identity: string;
  isAgent?: boolean;
}): boolean {
  if (participant.isAgent) return true;
  const id = participant.identity.toLowerCase();
  return id.startsWith("agent-") || id.startsWith("agent_");
}

export function filterHumanParticipants<T extends Participant>(
  participants: T[],
): T[] {
  return participants.filter((p) => !isAgentParticipant(p));
}
