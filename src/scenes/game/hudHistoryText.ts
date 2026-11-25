import type { GameActionLogEntry } from "../../types/GameTypes";

function pluralSuffix(count: number): string {
    return count > 1 ? "s" : "";
}

export function describeHistoryEntry(entry: GameActionLogEntry): {
    label: string;
    description: string;
} {
    switch (entry.type) {
        case "invocation":
            return {
                label: "INVOCATION",
                description: `${entry.monsterName} · coût : ${entry.cost}`,
            };
        case "movement":
            return {
                label: "DÉPLACEMENT",
                description: `${entry.monsterName} · ${entry.distance} case${pluralSuffix(entry.distance)}`,
            };
        case "attack":
            return {
                label: "ATTAQUE",
                description: `${entry.attackerName} → ${entry.targetName} · ${entry.effect ?? `${entry.damage} dégât${pluralSuffix(entry.damage)}`}`,
            };
    }
}
