export const DEFEAT_REPLY_PENALTY = 100_000;

export function scoreReplyThreat(
    baseDamage: number,
    baseHealth: number,
    backstabDamage = 0,
    backstabKills = 0,
): number {
    const basePenalty =
        baseDamage <= 0 ? 0 : baseDamage >= baseHealth ? DEFEAT_REPLY_PENALTY : baseDamage * 20;
    return Math.max(basePenalty, backstabDamage * 3 + backstabKills * 24);
}
