import type { BoardDefinition } from "./boards";
import { getStartingPositions } from "./boards";
import {
    canAttackMonster,
    getAttackDamage,
    getAttackZoneOptions,
    getGridDistance,
    hasLineOfSight,
} from "./monsterActions";
import type {
    DiceReserve,
    Monster,
    PlacedMonster,
    PlayerId,
    Position,
} from "../types/GameTypes";
import type { BotProfile, BotTactic } from "./botStrategy";
import { analyzePotentialRoutes } from "./routeAnalysis";

export interface StrategicSnapshot {
    board: BoardDefinition;
    blockedCells?: readonly Position[];
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
    return snapshot.monsters.filter((monster) => monster.owner === player && monster.currentHp > 0);
}

function getStrategicBoard(snapshot: StrategicSnapshot): BoardDefinition {
    return {
        ...snapshot.board,
        blockedCells: [
            ...snapshot.board.blockedCells,
            ...Object.values(getStartingPositions(snapshot.board)),
            ...(snapshot.blockedCells ?? []),
        ],
    };
}

export function createThreatScores(
    board: BoardDefinition,
    monsters: readonly PlacedMonster[],
    threatenedMonsterId: string,
): ReadonlyMap<string, number> {
    const threatenedMonster = monsters.find((monster) => monster.id === threatenedMonsterId);
    if (!threatenedMonster) return new Map();

    const opponent: PlayerId = threatenedMonster.owner === 1 ? 2 : 1;
    const threatScores = new Map<string, number>();
    for (const attacker of monsters) {
        if (attacker.owner !== opponent || attacker.currentHp <= 0) continue;

        const blockingCells = [
            ...board.blockedCells,
            ...monsters
                .filter(
                    (monster) =>
                        monster.currentHp > 0 &&
                        monster.id !== attacker.id &&
                        monster.id !== threatenedMonsterId,
                )
                .map((monster) => monster.position),
        ];
        const attackerThreats = new Map<string, number>();
        for (const [attackIndex, attack] of attacker.monster.attacks.entries()) {
            if (attack.targetsAlliesOnly || (attacker.attackCooldowns[attackIndex] ?? 0) > 1) {
                continue;
            }

            const isAreaAttack =
                attack.hitsAllies === true ||
                attack.movesToZone === true ||
                attack.pattern.type === "directionalArea" ||
                attack.pattern.type === "selfRadius";
            for (const option of getAttackZoneOptions(
                attacker.position,
                attacker.facing,
                attack.pattern,
                attack.targetsSelf,
            )) {
                const affectedCells = isAreaAttack ? option.cells : [option.target];
                for (const cell of affectedCells) {
                    if (
                        cell.x < 0 ||
                        cell.y < 0 ||
                        cell.x >= board.width ||
                        cell.y >= board.height ||
                        !canAttackMonster(attacker.monster, attack, threatenedMonster.monster) ||
                        (!isAreaAttack &&
                            !hasLineOfSight(attacker.position, cell, blockingCells))
                    ) {
                        continue;
                    }

                    const damage =
                        getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
                        (attack.statusEffect?.damagePerTurn ?? 0);
                    const key = `${cell.x},${cell.y}`;
                    attackerThreats.set(key, Math.max(attackerThreats.get(key) ?? 0, damage));
                }
            }
        }

        for (const [key, damage] of attackerThreats) {
            const lethalBonus = damage >= threatenedMonster.currentHp ? 4 : 0;
            threatScores.set(key, (threatScores.get(key) ?? 0) + damage + lethalBonus);
        }
    }

    return threatScores;
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
            (attack.damage + (attack.statusEffect?.damagePerTurn ?? 0)) / Math.max(1, attack.cost),
        0,
    );
}

function getDefensiveRouteCoverage(
    board: BoardDefinition,
    ownBase: Position,
    enemies: readonly PlacedMonster[],
): ReadonlyMap<string, number> {
    const coverage = new Map<string, number>();
    for (const enemy of enemies) {
        const routes = analyzePotentialRoutes(board, enemy.position, ownBase);
        const urgency = 1 / Math.max(1, routes.shortestDistance ?? board.width);
        for (const cell of routes.nearOptimalCells) {
            const key = `${cell.x},${cell.y}`;
            coverage.set(key, (coverage.get(key) ?? 0) + urgency);
        }
    }
    return coverage;
}

function getDefensiveTarget(
    board: BoardDefinition,
    monster: PlacedMonster,
    ownBase: Position,
    routeCoverage: ReadonlyMap<string, number>,
    claimedTargets: ReadonlySet<string>,
): Position {
    const blocked = new Set(
        board.blockedCells.map(({ x, y }) => `${x},${y}`),
    );
    const candidates: Position[] = [];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            const position = { x, y };
            const distance = getCachedDistance(position, ownBase);
            const key = `${x},${y}`;
            if (distance === 3 && !blocked.has(key)) candidates.push(position);
        }
    }
    const unclaimed = candidates.filter(
        ({ x, y }) => !claimedTargets.has(`${x},${y}`),
    );
    const available = unclaimed.length > 0 ? unclaimed : candidates;
    return (
        available
            .map((position) => ({
                position,
                score:
                    (routeCoverage.get(`${position.x},${position.y}`) ?? 0) * 100 -
                    getCachedDistance(monster.position, position) * 2 -
                    (claimedTargets.has(`${position.x},${position.y}`) ? 25 : 0),
            }))
            .sort(
                (first, second) =>
                    second.score - first.score ||
                    first.position.y - second.position.y ||
                    first.position.x - second.position.x,
            )[0]?.position ?? ownBase
    );
}

function getRouteCoverage(
    threats: readonly PlacedMonster[],
    defenders: readonly PlacedMonster[],
    protectedBase: Position,
    board: BoardDefinition,
): number {
    let coverage = 0;
    for (const threat of threats) {
        const routes = analyzePotentialRoutes(board, threat.position, protectedBase);
        for (const defender of defenders) {
            const distance = Math.min(
                ...routes.nearOptimalCells.map((cell) =>
                    getCachedDistance(defender.position, cell),
                ),
                Number.POSITIVE_INFINITY,
            );
            if (distance <= 3) coverage += (4 - distance) / Math.max(1, routes.shortestDistance ?? 1);
        }
    }
    return coverage;
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
    const routeBoard = getStrategicBoard(snapshot);
    const defensiveRouteCoverage =
        tactic === "defense"
            ? getDefensiveRouteCoverage(routeBoard, ownStart, enemies)
            : new Map<string, number>();
    const baseThreatened =
        tactic === "defense" &&
        enemies.some(
            (enemy) =>
                (analyzePotentialRoutes(routeBoard, enemy.position, ownStart).shortestDistance ??
                    Number.POSITIVE_INFINITY) <= 5,
        );
    const defendersNeeded =
        tactic !== "defense" || allies.length === 0
            ? 0
            : Math.max(
                  1,
                  Math.ceil(allies.length * (baseThreatened ? 2 / 3 : 1 / 3)),
              );
    let assignedDefenders = 0;

    return allies
        .slice()
        .sort((first, second) => {
            const firstSupport = getSupportValue(first.monster);
            const secondSupport = getSupportValue(second.monster);
            if (tactic !== "defense") return secondSupport - firstSupport;
            return (
                secondSupport - firstSupport ||
                second.currentHp / second.monster.hp - first.currentHp / first.monster.hp ||
                first.id.localeCompare(second.id)
            );
        })
        .map((monster): RoleAssignment => {
            const support = getSupportValue(monster.monster);

            if (support > 0) {
                const target = allies
                    .filter(
                        (ally) =>
                            ally.id !== monster.id &&
                            ally.currentHp < ally.monster.hp &&
                            !occupiedTargets.has(`${ally.position.x},${ally.position.y}`),
                    )
                    .sort(
                        (first, second) =>
                            first.currentHp / first.monster.hp -
                            second.currentHp / second.monster.hp,
                    )[0]?.position;
                if (target) {
                    occupiedTargets.add(`${target.x},${target.y}`);
                    return { monsterId: monster.id, role: "support", target };
                }
            }

            if (tactic === "defense" && assignedDefenders < defendersNeeded) {
                assignedDefenders++;
                const target = getDefensiveTarget(
                    routeBoard,
                    monster,
                    ownStart,
                    defensiveRouteCoverage,
                    occupiedTargets,
                );
                if (target) occupiedTargets.add(`${target.x},${target.y}`);
                return { monsterId: monster.id, role: "defense", target };
            }
            if (tactic === "defense" && enemies.length > 0) {
                const target = enemies
                    .filter(
                        (enemy) => !occupiedTargets.has(`${enemy.position.x},${enemy.position.y}`),
                    )
                    .sort(
                        (first, second) =>
                            getCachedDistance(monster.position, first.position) -
                            getCachedDistance(monster.position, second.position),
                    )[0]?.position;
                if (target) {
                    occupiedTargets.add(`${target.x},${target.y}`);
                    return { monsterId: monster.id, role: "hunt", target };
                }
            }

            if (tactic === "hunt") {
                const target = enemies
                    .filter(
                        (enemy) => !occupiedTargets.has(`${enemy.position.x},${enemy.position.y}`),
                    )
                    .sort(
                        (first, second) =>
                            getCachedDistance(monster.position, first.position) -
                            getCachedDistance(monster.position, second.position),
                    )[0]?.position;
                if (target) occupiedTargets.add(`${target.x},${target.y}`);
                return { monsterId: monster.id, role: "hunt", target };
            }

            const role =
                tactic === "offense" ||
                support > 0 ||
                (snapshot.profile === "offensive" && getOffenseValue(monster.monster) > 2)
                    ? "base"
                    : "territory";
            const target =
                role === "base"
                    ? enemyStart
                    : allies.length === 1
                      ? enemyStart
                      : monster.position;
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
    const routeBoard = getStrategicBoard(snapshot);
    const ownStart = starts[player];
    const enemyStart = starts[opponent];
    const enemyPositions = livingMonsters(snapshot, opponent).map((monster) => monster.position);
    const approachCoverage =
        snapshot.tactics[player] === "defense"
            ? getDefensiveRouteCoverage(
                  routeBoard,
                  ownStart,
                  livingMonsters(snapshot, opponent),
              )
            : new Map<string, number>();
    const blockers = [
        ...routeBoard.blockedCells,
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
        let score = enemyDistance * 2 - ownDistance + centrality * 0.25 - visibleThreat * 3;

        if (snapshot.tactics[player] === "defense") {
            score += -Math.abs(ownDistance - 3) * 4;
            score += (approachCoverage.get(key) ?? 0) * 3;
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

    let baseScore =
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
    const eliminationScore =
        own.length === 0 ? -35 : enemies.length === 0 ? 35 : (own.length - enemies.length) * 2;

    const ownTerritory = new Set(
        own.flatMap((monster) => monster.cells.map(({ x, y }) => `${x},${y}`)),
    ).size;
    const enemyTerritory = new Set(
        enemies.flatMap((monster) => monster.cells.map(({ x, y }) => `${x},${y}`)),
    ).size;
    const territoryScore = (ownTerritory - enemyTerritory) * 0.8;
    const routeBoard = getStrategicBoard(snapshot);
    const routeScore =
        getRouteCoverage(
            enemies,
            own,
            getStartingPositions(snapshot.board)[player],
            routeBoard,
        ) -
        getRouteCoverage(
            own,
            enemies,
            getStartingPositions(snapshot.board)[opponent],
            routeBoard,
        );
    const ownResources = Object.values(snapshot.reserves[player]).reduce(
        (total, amount) => total + amount,
        0,
    );
    const enemyResources = Object.values(snapshot.reserves[opponent]).reduce(
        (total, amount) => total + amount,
        0,
    );
    const resourceScore = (ownResources - enemyResources) * 0.25;
    if (enemyBase <= 0) return 100_000;
    if (ownBase <= 0) return -100_000;
    if (enemyBase === 1) baseScore += 50;
    if (ownBase === 1) baseScore -= 50;

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
                tacticalScore +=
                    (tactic === "hunt" ? 3 : 1) * (enemy.currentHp < monster.currentHp ? 2 : 1);
            }
        }
    }

    return (
        baseScore +
        armyScore * weight +
        territoryScore * weight +
        routeScore * 2 * weight +
        resourceScore +
        tacticalScore +
        eliminationScore * weight
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
