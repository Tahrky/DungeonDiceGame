import type { BoardDefinition } from "./boards";
import { getStartingPositions } from "./boards";
import { getGridDistance, hasLineOfSight } from "./monsterActions";
import type {
    DiceReserve,
    Monster,
    PlacedMonster,
    PlayerId,
    Position,
} from "../types/GameTypes";
import type { BotProfile, BotTactic } from "./botStrategy";

export interface StrategicSnapshot {
    board: BoardDefinition;
    health: Record<PlayerId, number>;
    initialHealth: number;
    monsters: readonly PlacedMonster[];
    reserves: Record<PlayerId, DiceReserve>;
    profile: BotProfile;
    tactics: Record<PlayerId, BotTactic>;
    currentPlayer: PlayerId;
    turn: number;
}

export interface RoleAssignment {
    monsterId: string;
    role: "base" | "hunt" | "defense" | "support" | "territory";
    target?: Position;
}

export interface DecisionDebug {
    situation: string;
    candidates: Array<{
        action: string;
        score: number;
        advantages: string[];
        risks: string[];
        consequence: string;
    }>;
    depth: number;
    positionsExplored: number;
    selectedAction: string;
}

const distanceCache = new Map<string, number>();

function getCachedDistance(first: Position, second: Position): number {
    const key = `${first.x},${first.y}:${second.x},${second.y}`;
    let result = distanceCache.get(key);
    if (result !== undefined) return result;
    result = getGridDistance(first, second);
    if (distanceCache.size >= 20_000) distanceCache.clear();
    distanceCache.set(key, result);
    return result;
}

export function clearAiCaches(): void {
    distanceCache.clear();
}

function livingMonsters(snapshot: StrategicSnapshot, player: PlayerId): PlacedMonster[] {
    return snapshot.monsters.filter(
        (monster) => monster.owner === player && monster.currentHp > 0,
    );
}

function getSupportValue(monster: Monster): number {
    return monster.attacks.reduce((total, attack) => {
        if (!attack.targetsAlliesOnly) return total;
        return (
            total +
            (attack.healAmount ?? 0) * 2 +
            (attack.cooldownReduction ?? 0) +
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0) +
            (attack.clearsStatusEffects ? 1 : 0)
        );
    }, 0);
}

function getOffenseValue(monster: Monster): number {
    return monster.attacks.reduce(
        (total, attack) =>
            total +
            (attack.damage + (attack.statusEffect?.damagePerTurn ?? 0)) /
                Math.max(1, attack.cost),
        0,
    );
}

export function assignMonsterRoles(
    snapshot: StrategicSnapshot,
    player: PlayerId,
): RoleAssignment[] {
    const opponent: PlayerId = player === 1 ? 2 : 1;
    const ownStart = getStartingPositions(snapshot.board)[player];
    const enemyStart = getStartingPositions(snapshot.board)[opponent];
    const enemies = livingMonsters(snapshot, opponent);
    const allies = livingMonsters(snapshot, player);
    const tactic = snapshot.tactics[player];
    const occupiedTargets = new Set<string>();

    return allies
        .slice()
        .sort((first, second) => {
            const firstSupport = getSupportValue(first.monster);
            const secondSupport = getSupportValue(second.monster);
            return secondSupport - firstSupport;
        })
        .map((monster) => {
            const support = getSupportValue(monster.monster);
            let role: RoleAssignment["role"] = "territory";
            let target: Position | undefined;

            if (support > 0) {
                role = "support";
                target = allies
                    .filter((ally) => ally.id !== monster.id)
                    .sort(
                        (first, second) =>
                            first.currentHp / first.monster.hp -
                            second.currentHp / second.monster.hp,
                    )[0]?.position;
            } else if (tactic === "defense") {
                role = "defense";
                target = ownStart;
            } else if (tactic === "hunt") {
                role = "hunt";
                target = enemies
                    .filter((enemy) => !occupiedTargets.has(`${enemy.position.x},${enemy.position.y}`))
                    .sort(
                        (first, second) =>
                            getCachedDistance(monster.position, first.position) -
                            getCachedDistance(monster.position, second.position),
                    )[0]?.position;
            } else {
                role =
                    tactic === "offense" ||
                    (snapshot.profile === "offensive" && getOffenseValue(monster.monster) > 2)
                        ? "base"
                        : "territory";
                target =
                    role === "base"
                        ? enemyStart
                        : allies.length === 1
                          ? enemyStart
                          : monster.position;
            }

            if (target) occupiedTargets.add(`${target.x},${target.y}`);
            return { monsterId: monster.id, role, target };
        });
}

export function createStrategicCellScorer(
    snapshot: StrategicSnapshot,
    player: PlayerId,
): (position: Position) => number {
    const opponent: PlayerId = player === 1 ? 2 : 1;
    const starts = getStartingPositions(snapshot.board);
    const ownStart = starts[player];
    const enemyStart = starts[opponent];
    const enemyPositions = livingMonsters(snapshot, opponent).map((monster) => monster.position);
    const blockers = [
        ...snapshot.board.blockedCells,
        ...snapshot.monsters
            .filter((monster) => monster.currentHp > 0)
            .map((monster) => monster.position),
    ];
    const visibleThreat = enemyPositions.filter((enemy) =>
        hasLineOfSight(enemy, ownStart, blockers),
    ).length;
    const centerX = (snapshot.board.width - 1) / 2;
    const centerY = (snapshot.board.height - 1) / 2;
    const scores = new Map<string, number>();

    return (position) => {
        const key = `${position.x},${position.y}`;
        const cached = scores.get(key);
        if (cached !== undefined) return cached;

        const ownDistance = Math.abs(position.x - ownStart.x) + Math.abs(position.y - ownStart.y);
        const enemyDistance =
            Math.abs(position.x - enemyStart.x) + Math.abs(position.y - enemyStart.y);
        const centrality = -Math.abs(position.x - centerX) - Math.abs(position.y - centerY);
        let score =
            enemyDistance * 2 -
            ownDistance +
            centrality * 0.25 -
            visibleThreat * 3;

        if (snapshot.tactics[player] === "defense") {
            score += -Math.abs(ownDistance - 3) * 4;
        } else if (snapshot.tactics[player] === "offense") {
            score += (snapshot.board.width - enemyDistance) * 3;
        } else if (snapshot.tactics[player] === "hunt") {
            let nearestEnemy = snapshot.board.width;
            for (const enemy of enemyPositions) {
                nearestEnemy = Math.min(
                    nearestEnemy,
                    Math.abs(position.x - enemy.x) + Math.abs(position.y - enemy.y),
                );
            }
            score -= nearestEnemy * 2;
        }

        scores.set(key, score);
        return score;
    };
}

export function getStrategicCellScore(
    snapshot: StrategicSnapshot,
    player: PlayerId,
    position: Position,
): number {
    return createStrategicCellScorer(snapshot, player)(position);
}

export function evaluateStrategicState(snapshot: StrategicSnapshot): number {
    const player = snapshot.currentPlayer;
    const opponent: PlayerId = player === 1 ? 2 : 1;
    const own = livingMonsters(snapshot, player);
    const enemies = livingMonsters(snapshot, opponent);
    const ownBase = snapshot.health[player];
    const enemyBase = snapshot.health[opponent];

    const baseScore =
        (ownBase - enemyBase) * 18 +
        (snapshot.initialHealth - ownBase) * -2 +
        (snapshot.initialHealth - enemyBase) * 2;

    const ownArmy = own.reduce(
        (total, monster) =>
            total +
            monster.currentHp * 2 +
            getOffenseValue(monster.monster) * 3 +
            getSupportValue(monster.monster),
        0,
    );
    const enemyArmy = enemies.reduce(
        (total, monster) =>
            total +
            monster.currentHp * 2 +
            getOffenseValue(monster.monster) * 3 +
            getSupportValue(monster.monster),
        0,
    );
    const armyScore = ownArmy - enemyArmy;

    const ownTerritory = new Set(
        own.flatMap((monster) => monster.cells.map(({ x, y }) => `${x},${y}`)),
    ).size;
    const enemyTerritory = new Set(
        enemies.flatMap((monster) => monster.cells.map(({ x, y }) => `${x},${y}`)),
    ).size;
    const territoryScore = (ownTerritory - enemyTerritory) * 0.8;

    const ownResources = Object.values(snapshot.reserves[player]).reduce(
        (total, amount) => total + amount,
        0,
    );
    const enemyResources = Object.values(snapshot.reserves[opponent]).reduce(
        (total, amount) => total + amount,
        0,
    );
    const resourceScore = (ownResources - enemyResources) * 0.25;

    const tactic = snapshot.tactics[player];
    const profileWeights: Record<BotProfile, Record<BotTactic, number>> = {
        balanced: { offense: 1, hunt: 1, balanced: 1.25, defense: 1 },
        cheap: { offense: 0.9, hunt: 0.8, balanced: 1.1, defense: 1.1 },
        expensive: { offense: 1.1, hunt: 1, balanced: 1, defense: 0.9 },
        offensive: { offense: 1.5, hunt: 0.8, balanced: 1.1, defense: 0.6 },
        support: { offense: 0.8, hunt: 0.9, balanced: 1.3, defense: 1.2 },
        defensive: { offense: 0.6, hunt: 0.7, balanced: 1.1, defense: 1.5 },
        tracker: { offense: 0.8, hunt: 1.5, balanced: 1.1, defense: 1 },
    };
    const weight = profileWeights[snapshot.profile][tactic] ?? 1;

    let tacticalScore = 0;
    for (const monster of own) {
        for (const enemy of enemies) {
            const distance = getCachedDistance(monster.position, enemy.position);
            if (distance <= 3) {
                tacticalScore += (tactic === "hunt" ? 3 : 1) * (enemy.currentHp < monster.currentHp ? 2 : 1);
            }
        }
    }

    return (
        baseScore +
        armyScore * weight +
        territoryScore * weight +
        resourceScore +
        tacticalScore
    );
}

export function createDecisionDebug(
    snapshot: StrategicSnapshot,
    selectedAction: string,
): DecisionDebug {
    const tactic = snapshot.tactics[snapshot.currentPlayer];
    return {
        situation: `tour ${snapshot.turn}, tactique ${tactic}, base J${snapshot.currentPlayer}=${snapshot.health[snapshot.currentPlayer]}`,
        candidates: [],
        depth: 1,
        positionsExplored: snapshot.monsters.length,
        selectedAction,
    };
}
