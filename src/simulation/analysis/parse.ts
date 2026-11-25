import { parseBoardDefinition } from "../../game/boards";
import { parseGameConfiguration } from "../../game/gameConfiguration";
import { isPlainRecord as isRecord } from "../../utils/guards";
import type { DiceReserve, PlayerId } from "../../types/GameTypes";
import { BOT_PROFILES, type BotProfile, type FinalBoard, type SimulationEvent } from "../types";
import type { AnalyzableMatch, AnalyzablePlayerStats, SimulationData } from "./types";

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isPlayerId(value: unknown): value is PlayerId {
    return value === 1 || value === 2;
}

function isDiceReserve(value: unknown): value is DiceReserve {
    return (
        isRecord(value) &&
        ["invocation", "attack", "movement"].every(
            (symbol) =>
                typeof value[symbol] === "number" &&
                Number.isInteger(value[symbol]) &&
                value[symbol] >= 0,
        )
    );
}

function isProfile(value: unknown): value is BotProfile {
    return typeof value === "string" && BOT_PROFILES.includes(value as BotProfile);
}

function isStatistics(value: unknown): value is AnalyzablePlayerStats {
    return (
        isRecord(value) &&
        isNumber(value.summoned) &&
        isRecord(value.summonedByMonster) &&
        Object.values(value.summonedByMonster).every(isNumber) &&
        isNumber(value.attacks) &&
        isNumber(value.damageDealt) &&
        isNumber(value.monstersKilled) &&
        isNumber(value.baseDamage) &&
        isNumber(value.movements) &&
        (value.lastMonsterSummonTurn === undefined ||
            value.lastMonsterSummonTurn === null ||
            (typeof value.lastMonsterSummonTurn === "number" &&
                Number.isInteger(value.lastMonsterSummonTurn) &&
                value.lastMonsterSummonTurn >= 1)) &&
        (value.symbolsSpent === undefined || isDiceReserve(value.symbolsSpent)) &&
        (value.conversionLosses === undefined || isNumber(value.conversionLosses)) &&
        [
            "turnsWithoutSummon",
            "turnsWithoutAttack",
            "turnsWithoutMovement",
            "turnsWithoutUsefulAction",
            "noLegalPlacementTurns",
            "stagnantMonsterTurns",
            "blockedInvocationAttempts",
            "unreachableObjectives",
        ].every((key) => value[key] === undefined || isNumber(value[key])) &&
        (value.actionsSkippedByReason === undefined ||
            (isRecord(value.actionsSkippedByReason) &&
                Object.values(value.actionsSkippedByReason).every(isNumber)))
    );
}

function isSimulationEvent(value: unknown): value is SimulationEvent {
    const optionalNumbers = [
        "targetsHit",
        "damageToMonsters",
        "damageToEnemies",
        "damageToAllies",
        "damageToBase",
        "overkillDamage",
        "criticalDamageBonus",
        "healingDone",
        "healingWaste",
        "effectsCleared",
        "buffsApplied",
        "cooldownReductionUsed",
    ];
    const optionalBooleans = ["camouflageTriggered", "camouflageSuppressed"];
    return (
        isRecord(value) &&
        Number.isInteger(value.turn) &&
        isPlayerId(value.player) &&
        typeof value.type === "string" &&
        typeof value.description === "string" &&
        (value.monsterId === undefined || typeof value.monsterId === "string") &&
        (value.monsterTypeId === undefined || typeof value.monsterTypeId === "string") &&
        (value.monsterName === undefined || typeof value.monsterName === "string") &&
        (value.attackName === undefined || typeof value.attackName === "string") &&
        (value.damage === undefined || isNumber(value.damage)) &&
        (value.cost === undefined || isNumber(value.cost)) &&
        optionalNumbers.every((key) => value[key] === undefined || isNumber(value[key])) &&
        optionalBooleans.every((key) => value[key] === undefined || typeof value[key] === "boolean")
    );
}

function isFinalBoard(value: unknown): value is FinalBoard {
    return (
        isRecord(value) &&
        Number.isInteger(value.width) &&
        Number.isInteger(value.height) &&
        Array.isArray(value.rows) &&
        value.rows.length === value.height &&
        value.rows.every((row) => typeof row === "string" && row.length === value.width) &&
        Array.isArray(value.legend) &&
        value.legend.every(
            (item) =>
                isRecord(item) &&
                typeof item.symbol === "string" &&
                typeof item.meaning === "string",
        )
    );
}

function isFinalMonster(value: unknown): value is AnalyzableMatch["finalMonsters"][number] {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.monsterId === "string" &&
        typeof value.name === "string" &&
        (value.symbol === undefined ||
            (typeof value.symbol === "string" && /^[A-Z]$/.test(value.symbol))) &&
        isPlayerId(value.owner) &&
        isNumber(value.hp) &&
        isNumber(value.maxHp) &&
        isRecord(value.position) &&
        Number.isInteger(value.position.x) &&
        Number.isInteger(value.position.y)
    );
}

function isMatch(value: unknown): value is AnalyzableMatch {
    if (
        !isRecord(value) ||
        !isRecord(value.profiles) ||
        !isRecord(value.statistics) ||
        !isRecord(value.decks)
    ) {
        return false;
    }
    return (
        Number.isInteger(value.id) &&
        Number.isInteger(value.seed) &&
        isPlayerId(value.startingPlayer) &&
        isProfile(value.profiles[1]) &&
        isProfile(value.profiles[2]) &&
        Array.isArray(value.decks[1]) &&
        value.decks[1].every((id) => typeof id === "string") &&
        Array.isArray(value.decks[2]) &&
        value.decks[2].every((id) => typeof id === "string") &&
        (value.winner === null || isPlayerId(value.winner)) &&
        (value.finishReason === "baseDestroyed" ||
            value.finishReason === "monstersEliminated" ||
            value.finishReason === "turnLimit") &&
        Number.isInteger(value.turns) &&
        isStatistics(value.statistics[1]) &&
        isStatistics(value.statistics[2]) &&
        isRecord(value.remainingResources) &&
        isDiceReserve(value.remainingResources[1]) &&
        isDiceReserve(value.remainingResources[2]) &&
        isFinalBoard(value.finalBoard) &&
        Array.isArray(value.finalMonsters) &&
        value.finalMonsters.every(isFinalMonster) &&
        Array.isArray(value.history) &&
        value.history.every(isSimulationEvent)
    );
}

export function parseSimulationData(value: unknown): SimulationData | null {
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.matches)) {
        return null;
    }
    const configuration = parseGameConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    if (!configuration || !board || value.matches.length === 0 || !value.matches.every(isMatch)) {
        return null;
    }
    return { configuration, board, matches: value.matches };
}
