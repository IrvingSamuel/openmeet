export const HAND_RAISED_ATTR = "handRaised";

export function isHandRaised(participant: {
  attributes: Readonly<Record<string, string>>;
}): boolean {
  return participant.attributes[HAND_RAISED_ATTR] === "1";
}
