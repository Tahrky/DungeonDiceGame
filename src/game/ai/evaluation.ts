import { getStartingPositions } from "../boards";
import type { BotProfile, BotTactic } from "../botStrategy";
import { getGridDistance, positionKey } from "../geometry";
import { opposingPlayer } from "../matchRules";
import type { DiceReserve, PlacedMonster } from "../../types/GameTypes";
import { getStrategicBoard, livingMonsters } from "./common";
import { getOffenseValue, getSupportValue } from "./monsterValue";
import { getRouteCoverage } from "./routeCoverage";
import type { StrategicSnapshot } from "./types";

const WIN_SCORE = 100_000;

const PROFILE_WEIGHTS: Record<BotProfile, Record<BotTactic, number>> = {
    balanced: { offense: 1, hunt: 1, balanced: 1.25, defense: 1 },
    cheap: { offense: 0.9, hunt: 0.8, balanced: 1.1, defense: 1.1 },
    expensive: { offense: 1.1, hunt: 1, balanced: 1, defense: 0.9 },
    offensive: { offense: 1.5, hunt: 0.8, balanced: 1.1, defense: 0.6 },
    support: { offense: 0.8, hunt: 0.9, balanced: 1.3, defense: 1.2 },
    defensive: { offense: 0.6, hunt: 0.7, balanced: 1.1, defense: 1.5 },
    tracker: { offense: 0.8, hunt: 1.5, balanced: 1.1, defense: 1 },
    random: { offense: 1, hunt: 1, balanced: 1, defense: 1 },
    "random-deck": { offense: 1, hunt: 1, balanced: 1.25, defense: 1 },
    "random-strategy": { offense: 1, hunt: 1, balanced: 1, defense: 1 },
    greedy: { offense: 1.4, hunt: 1, balanced: 1, defense: 0.8 },
};

function getArmyValue(monsters: readonly PlacedMonster[]): number {
    return monsters.reduce(
        (total, monster) =>
            total +
            monster.currentHp * 2 +
            getOffenseValue(monster.monster) * 3 +
            getSupportValue(monster.monster),
        0,
    );
}

function countTerritory(monsters: readonly PlacedMonster[]): number {
    return new Set(monsters.flatMap((monster) => monster.cells.map(positionKey))).size;
}

function countResources(reserve: DiceReserve): number {
    return Object.values(reserve).reduce((total, amount) => total + amount, 0);
}

function getTacticalScore(
    tactic: BotTactic,
    own: readonly PlacedMonster[],
    enemies: readonly PlacedMonster[],
): number {
    let score = 0;
    for (const monster of own) {
        for (const enemy of enemies) {
            if (getGridDistance(monster.position, enemy.position) <= 3) {
                score +=
                    (tactic === "hunt" ? 3 : 1) * (enemy.currentHp < monster.currentHp ? 2 : 1);
            }
        }
    }
    return score;
}

export function evaluateStrategicState(snapshot: StrategicSnapshot): number {
    const player = snapshot.currentPlayer;
    const opponent = opposingPlayer(player);
    const ownBase = snapshot.health[player];
    const enemyBase = snapshot.health[opponent];
    if (enemyBase <= 0) return WIN_SCORE;
    if (ownBase <= 0) return -WIN_SCORE;

    const own = livingMonsters(snapshot, player);
    const enemies = livingMonsters(snapshot, opponent);
    const tactic = snapshot.tactics[player];
    const weight = PROFILE_WEIGHTS[snapshot.profile][tactic] ?? 1;
    const starts = getStartingPositions(snapshot.board);
    const routeBoard = getStrategicBoard(snapshot, starts);

    let baseScore =
        (ownBase - enemyBase) * 18 +
        (snapshot.initialHealth - ownBase) * -2 +
        (snapshot.initialHealth - enemyBase) * 2;
    if (enemyBase === 1) baseScore += 50;
    if (ownBase === 1) baseScore -= 50;

    const armyScore = getArmyValue(own) - getArmyValue(enemies);
    const eliminationScore =
        own.length === 0 ? -35 : enemies.length === 0 ? 35 : (own.length - enemies.length) * 2;
    const territoryScore = (countTerritory(own) - countTerritory(enemies)) * 0.8;
    const routeScore =
        getRouteCoverage(enemies, own, starts[player], routeBoard) -
        getRouteCoverage(own, enemies, starts[opponent], routeBoard);
    const resourceScore =
        (countResources(snapshot.reserves[player]) - countResources(snapshot.reserves[opponent])) *
        0.25;

    return (
        baseScore +
        armyScore * weight +
        territoryScore * weight +
        routeScore * 2 * weight +
        resourceScore +
        getTacticalScore(tactic, own, enemies) +
        eliminationScore * weight
    );
}
