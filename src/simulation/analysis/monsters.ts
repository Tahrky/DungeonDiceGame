import { createEmptyDiceReserve } from "../../game/diceResources";
import { PLAYER_IDS } from "../../game/matchRules";
import type { DiceReserve, PlayerId } from "../../types/GameTypes";
import type { SimulationEvent } from "../types";
import type {
    AnalyzableMatch,
    AnalyzableMonster,
    MatchMonsterAnalysis,
    MonsterAnalysis,
    MonsterAttackUsage,
} from "./types";

type MonsterEvent = SimulationEvent & { type: "invocation" | "attack" | "status" | "movement" };

interface MonsterTotals {
    appearances: number;
    matchesSeen: number;
    damage: number;
    directDamage: number;
    damageOverTime: number;
    attacks: number;
    attacksWithDamage: number;
    kills: number;
    movements: number;
    invocationsRecorded: number;
    firstInvocationTurnsTotal: number;
    matchesWithFirstInvocation: number;
    resourceCosts: DiceReserve;
    attackUsage: Map<string, number>;
}

export interface MonsterStatistics {
    totals: Map<string, MonsterTotals>;
    idsByName: Map<string, string>;
    resourceCostsAvailable: boolean;
}

function isMonsterEvent(event: SimulationEvent): event is MonsterEvent {
    return (
        event.type === "invocation" ||
        event.type === "attack" ||
        event.type === "status" ||
        event.type === "movement"
    );
}

function countAttackUse(usage: Map<string, number>, event: SimulationEvent): void {
    const attackName = event.attackName ?? event.description.match(/«([^»]+)»/)?.[1]?.trim();
    if (attackName) usage.set(attackName, (usage.get(attackName) ?? 0) + 1);
}

function sortAttackUsage(usage: Map<string, number>): MonsterAttackUsage[] {
    return [...usage.entries()]
        .map(([name, uses]) => ({ name, uses }))
        .sort((first, second) => second.uses - first.uses || first.name.localeCompare(second.name));
}

export function analyzeMatchMonsters(match: AnalyzableMatch): MatchMonsterAnalysis[] {
    const monsters = new Map(
        match.finalMonsters.map((monster) => [
            monster.id,
            {
                ...monster,
                attacks: 0,
                totalDamage: 0,
                movements: 0,
                attackUsage: new Map<string, number>(),
            },
        ]),
    );

    for (const event of match.history) {
        const monster = event.monsterId ? monsters.get(event.monsterId) : undefined;
        if (!monster) continue;

        if (event.type === "attack") {
            monster.attacks++;
            monster.totalDamage += event.damage ?? 0;
            countAttackUse(monster.attackUsage, event);
        } else if (event.type === "status") {
            monster.totalDamage += event.damage ?? 0;
        } else if (event.type === "movement") {
            monster.movements++;
        }
    }

    return [...monsters.values()].map(({ attackUsage, ...monster }) => ({
        ...monster,
        attackUsage: sortAttackUsage(attackUsage),
    }));
}

function createMonsterTotals(): MonsterTotals {
    return {
        appearances: 0,
        matchesSeen: 0,
        damage: 0,
        directDamage: 0,
        damageOverTime: 0,
        attacks: 0,
        attacksWithDamage: 0,
        kills: 0,
        movements: 0,
        invocationsRecorded: 0,
        firstInvocationTurnsTotal: 0,
        matchesWithFirstInvocation: 0,
        resourceCosts: createEmptyDiceReserve(),
        attackUsage: new Map(),
    };
}

export function createMonsterStatistics(monsters: readonly AnalyzableMonster[]): MonsterStatistics {
    return {
        totals: new Map(monsters.map((monster) => [monster.id, createMonsterTotals()])),
        idsByName: new Map(monsters.map((monster) => [monster.name, monster.id])),
        resourceCostsAvailable: true,
    };
}

function recordAppearances(
    statistics: MonsterStatistics,
    match: AnalyzableMatch,
    players: readonly PlayerId[],
): void {
    const monstersSeen = new Set<string>();
    for (const player of players) {
        for (const [monsterId, count] of Object.entries(
            match.statistics[player].summonedByMonster,
        )) {
            const total = statistics.totals.get(monsterId);
            if (!total) continue;
            total.appearances += count;
            if (count > 0) monstersSeen.add(monsterId);
        }
    }
    for (const monsterId of monstersSeen) statistics.totals.get(monsterId)!.matchesSeen++;
}

function recordAttack(total: MonsterTotals, event: SimulationEvent): void {
    const damage = event.damage ?? 0;
    total.directDamage += damage;
    total.damage += damage;
    total.attacks++;
    if (damage > 0) total.attacksWithDamage++;
    if (event.target?.includes(" éliminé")) total.kills++;
    countAttackUse(total.attackUsage, event);
}

export function addMatchMonsterStatistics(
    statistics: MonsterStatistics,
    match: AnalyzableMatch,
    players: readonly PlayerId[] = PLAYER_IDS,
): void {
    if (match.history.length === 0) statistics.resourceCostsAvailable = false;
    recordAppearances(statistics, match, players);

    const eventCounts = { invocation: 0, attack: 0, status: 0, movement: 0 };
    const firstInvocationTurns = new Map<string, number>();
    for (const event of match.history) {
        if (!players.includes(event.player) || !isMonsterEvent(event)) continue;
        const monsterTypeId =
            event.monsterTypeId ??
            (event.monsterName ? statistics.idsByName.get(event.monsterName) : undefined);
        const total = monsterTypeId ? statistics.totals.get(monsterTypeId) : undefined;
        if (!monsterTypeId || !total) continue;

        eventCounts[event.type]++;
        if (event.type !== "status") {
            if (event.cost === undefined) statistics.resourceCostsAvailable = false;
            else total.resourceCosts[event.type] += event.cost;
        }
        if (event.type === "invocation") {
            total.invocationsRecorded++;
            const firstTurn = firstInvocationTurns.get(monsterTypeId) ?? event.turn;
            firstInvocationTurns.set(monsterTypeId, Math.min(firstTurn, event.turn));
        } else if (event.type === "movement") {
            total.movements++;
        } else if (event.type === "status") {
            total.damageOverTime += event.damage ?? 0;
            total.damage += event.damage ?? 0;
        } else {
            recordAttack(total, event);
        }
    }

    const expected = players.reduce(
        (counts, player) => {
            const playerStats = match.statistics[player];
            counts.invocation += playerStats.summoned;
            counts.attack += playerStats.attacks;
            counts.movement += playerStats.movements;
            return counts;
        },
        { invocation: 0, attack: 0, movement: 0 },
    );
    if (
        eventCounts.invocation !== expected.invocation ||
        eventCounts.attack !== expected.attack ||
        eventCounts.movement !== expected.movement
    ) {
        statistics.resourceCostsAvailable = false;
    }
    for (const [monsterId, firstTurn] of firstInvocationTurns) {
        const total = statistics.totals.get(monsterId)!;
        total.firstInvocationTurnsTotal += firstTurn;
        total.matchesWithFirstInvocation++;
    }
}

export function getMonsterAnalyses(
    statistics: MonsterStatistics,
    monsters: readonly AnalyzableMonster[],
): MonsterAnalysis[] {
    return monsters
        .map((monster) => {
            const total = statistics.totals.get(monster.id)!;
            return {
                id: monster.id,
                name: monster.name,
                appearances: total.appearances,
                matchesSeen: total.matchesSeen,
                totalDamage: total.damage,
                directDamage: total.directDamage,
                damageOverTime: total.damageOverTime,
                attacks: total.attacks,
                attacksWithDamage: total.attacksWithDamage,
                kills: total.kills,
                movements: total.movements,
                averageMovements: total.appearances > 0 ? total.movements / total.appearances : 0,
                averageFirstInvocationTurn:
                    total.appearances > 0 && total.invocationsRecorded === total.appearances
                        ? total.firstInvocationTurnsTotal / total.matchesWithFirstInvocation
                        : null,
                resourceCosts: statistics.resourceCostsAvailable ? total.resourceCosts : null,
                attackUsage: sortAttackUsage(total.attackUsage),
            };
        })
        .sort(
            (first, second) =>
                second.appearances - first.appearances || second.totalDamage - first.totalDamage,
        );
}
