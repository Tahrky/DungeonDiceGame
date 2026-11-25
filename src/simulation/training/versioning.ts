import { DICE } from "../../data/dice";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import type { BoardDefinition } from "../../game/boards";
import { SYMBOL_CONVERSION_RULES } from "../../game/diceResources";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { BOT_STRATEGY_WEIGHT_KEYS, type BotProfile } from "../../game/botStrategy";

export const TRAINING_REPORT_SCHEMA_VERSION = 2;
export const WEIGHTS_SCHEMA_VERSION = "2";
export const RULES_ENGINE_VERSION = "2";
export const EVALUATION_VERSION = "11";
export const SIMULATOR_VERSION = "12";

export const BOT_WEIGHT_GROUPS = {
    combat: ["baseDamage", "damage", "statusDamage", "kills", "support", "friendlyDamage"],
    economy: [
        "costEfficiency",
        "monsterOffense",
        "monsterSupport",
        "monsterDurability",
        "monsterCost",
        "invocationPriority",
    ],
    placement: [
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "routeDenial",
        "routeRedundancy",
        "chokepointControl",
        "strategicPlacement",
    ],
    movement: [
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
        "defensiveCoverage",
        "formationCohesion",
        "interception",
    ],
} as const satisfies Record<string, readonly (typeof BOT_STRATEGY_WEIGHT_KEYS)[number][]>;

export type BotWeightGroup = keyof typeof BOT_WEIGHT_GROUPS;
export const ALL_WEIGHT_GROUPS = Object.keys(BOT_WEIGHT_GROUPS) as BotWeightGroup[];
export type TrainingMode = "default" | "warmStart" | "hybrid";
export type CompatibilityLevel = "exact" | "partial" | "incompatible" | "legacy";

export interface TrainingFingerprint {
    rulesHash: string;
    diceHash: string;
    conversionHash: string;
    monstersHash: string;
    placementPatternsHash: string;
    boardHash: string;
    rulesEngineVersion: string;
    evaluationVersion: string;
    simulatorVersion: string;
    weightsSchemaVersion: string;
}

export interface BotTrainingMetadata extends TrainingFingerprint {
    schemaVersion: number;
    trainingId: string;
    createdAt: string;
    profile: BotProfile;
    initializationMode: TrainingMode;
    parentTrainingId?: string;
    trainingSeed: number;
    trainingSeeds: number[];
    selectionSeeds: number[];
    validationSeeds: number[];
    generationCount: number;
    populationSize: number;
}

export interface TrainingCompatibility {
    level: CompatibilityLevel;
    differences: string[];
    affectedGroups: BotWeightGroup[];
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([key, entry]) => [key, canonicalize(entry)]),
    );
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

function hash(value: unknown): string {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const seeds = [0x811c9dc5, 0xdeadbeef, 0x9e3779b9, 0x85ebca6b];
    return seeds
        .map((seed) => {
            let result = seed;
            for (const byte of bytes) {
                result = Math.imul(result ^ byte, 0x01000193) >>> 0;
            }
            return result.toString(16).padStart(8, "0");
        })
        .join("");
}

function normalizeMonsterForGameplay(monster: GameConfiguration["monsters"][number]) {
    return {
        id: monster.id,
        cost: monster.cost,
        hp: monster.hp,
        movementRange: monster.movementRange,
        attackActionsPerTurn: monster.attackActionsPerTurn ?? 1,
        movementActionsPerTurn: monster.movementActionsPerTurn ?? 1,
        movementCost: monster.movementCost ?? 1,
        flying: monster.flying ?? false,
        highAltitude: monster.highAltitude ?? false,
        canPassHostiles: monster.canPassHostiles ?? false,
        bonusDamageFromBehind: monster.bonusDamageFromBehind ?? 0,
        attacks: monster.attacks.map((attack) => ({
            damage: attack.damage,
            cost: attack.cost,
            pattern: attack.pattern,
            statusEffect: attack.statusEffect
                ? {
                      type: attack.statusEffect.type,
                      damagePerTurn: attack.statusEffect.damagePerTurn,
                      duration: attack.statusEffect.duration,
                  }
                : null,
            cooldownTurns: attack.cooldownTurns ?? 0,
            initialCooldownTurns: attack.initialCooldownTurns ?? attack.cooldownTurns ?? 0,
            usesPerTurn: attack.usesPerTurn ?? 1,
            hitsAllies: attack.hitsAllies ?? false,
            targetsAlliesOnly: attack.targetsAlliesOnly ?? false,
            targetsSelf: attack.targetsSelf ?? false,
            clearsStatusEffects: attack.clearsStatusEffects ?? false,
            healAmount: attack.healAmount ?? 0,
            cooldownReduction: attack.cooldownReduction ?? 0,
            movementRangeBonus: attack.movementRangeBonus ?? 0,
            movementCostReduction: attack.movementCostReduction ?? 0,
            attackDamageBonus: attack.attackDamageBonus ?? 0,
            attackCostReduction: attack.attackCostReduction ?? 0,
            movesToZone: attack.movesToZone ?? false,
        })),
    };
}

export function createTrainingFingerprint(
    configuration: GameConfiguration,
    board: BoardDefinition,
): TrainingFingerprint {
    const dice = {
        count: configuration.diceCount,
        faces: DICE.slice(0, configuration.diceCount).map(({ faces }) => [...faces]),
        invocationExcludedWhenMaxed: configuration.removeInvocationDiceWhenNoMonsters,
    };
    const rules = {
        deckSize: configuration.deckSize,
        randomBoard: configuration.randomBoard,
        testBoard: configuration.testBoard,
        initialPlayerHealth: configuration.initialPlayerHealth,
        allowBaseAttackOnSummonTurn: configuration.allowBaseAttackOnSummonTurn,
        removeInvocationDiceWhenNoMonsters: configuration.removeInvocationDiceWhenNoMonsters,
        protectFirstDeployment: configuration.protectFirstDeployment,
        maxMonstersPerPlayer: configuration.maxMonstersPerPlayer,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };
    const conversion = SYMBOL_CONVERSION_RULES;
    const monsters = configuration.monsters
        .map(normalizeMonsterForGameplay)
        .sort((first, second) => first.id.localeCompare(second.id));
    const blockedCells = board.blockedCells
        .map(({ x, y }) => ({ x, y }))
        .sort((first, second) => first.y - second.y || first.x - second.x);

    return {
        rulesHash: hash(rules),
        diceHash: hash(dice),
        conversionHash: hash(conversion),
        monstersHash: hash(monsters),
        placementPatternsHash: hash(PLACEMENT_PATTERNS),
        boardHash: hash({ width: board.width, height: board.height, blockedCells }),
        rulesEngineVersion: RULES_ENGINE_VERSION,
        evaluationVersion: EVALUATION_VERSION,
        simulatorVersion: SIMULATOR_VERSION,
        weightsSchemaVersion: WEIGHTS_SCHEMA_VERSION,
    };
}

export function createBotTrainingMetadata(
    fingerprint: TrainingFingerprint,
    input: Omit<
        BotTrainingMetadata,
        keyof TrainingFingerprint | "schemaVersion" | "trainingId" | "createdAt"
    >,
    createdAt = new Date().toISOString(),
): BotTrainingMetadata {
    const identity = {
        ...fingerprint,
        profile: input.profile,
        initializationMode: input.initializationMode,
        trainingSeed: input.trainingSeed,
        createdAt,
    };
    return {
        ...fingerprint,
        schemaVersion: TRAINING_REPORT_SCHEMA_VERSION,
        trainingId: hash(identity),
        createdAt,
        ...input,
    };
}

export function compareTrainingCompatibility(
    previous: Partial<BotTrainingMetadata> | undefined,
    current: TrainingFingerprint,
): TrainingCompatibility {
    if (!previous || typeof previous.schemaVersion !== "number") {
        return {
            level: "legacy",
            differences: ["Le rapport ne contient pas de métadonnées de version."],
            affectedGroups: [...ALL_WEIGHT_GROUPS],
        };
    }

    const differences: string[] = [];
    const affected = new Set<BotWeightGroup>();
    const changed = (key: keyof TrainingFingerprint): boolean => previous[key] !== current[key];
    if (previous.schemaVersion !== TRAINING_REPORT_SCHEMA_VERSION) {
        differences.push(
            `version incompatible : schemaVersion ` +
                `(${previous.schemaVersion} → ${TRAINING_REPORT_SCHEMA_VERSION})`,
        );
    }
    const mark = (
        label: string,
        key: keyof TrainingFingerprint,
        groups: readonly BotWeightGroup[],
    ) => {
        if (!changed(key)) return;
        differences.push(`${label} (${String(previous[key] ?? "indisponible")} → ${current[key]})`);
        for (const group of groups) affected.add(group);
    };
    mark("règles de partie", "rulesHash", ALL_WEIGHT_GROUPS);
    mark("distribution des dés", "diceHash", ["combat", "economy", "movement"]);
    mark("conversion et conservation des ressources", "conversionHash", [
        "combat",
        "economy",
        "movement",
    ]);
    mark("caractéristiques de gameplay des monstres", "monstersHash", ALL_WEIGHT_GROUPS);
    mark("motifs de placement", "placementPatternsHash", ["economy", "placement"]);
    mark("géométrie du plateau", "boardHash", ["combat", "placement", "movement"]);

    const engineVersionKeys: (keyof TrainingFingerprint)[] = [
        "rulesEngineVersion",
        "evaluationVersion",
        "simulatorVersion",
    ];
    for (const key of engineVersionKeys) {
        if (changed(key)) {
            differences.push(
                `version incompatible : ${key} ` +
                    `(${String(previous[key] ?? "indisponible")} → ${current[key]})`,
            );
        }
    }
    if (changed("weightsSchemaVersion")) {
        differences.push(
            `version des poids (${String(previous.weightsSchemaVersion ?? "indisponible")} → ${current.weightsSchemaVersion})`,
        );
        affected.add("placement");
        affected.add("movement");
    }

    const incompatible =
        previous.schemaVersion !== TRAINING_REPORT_SCHEMA_VERSION ||
        engineVersionKeys.some(changed);
    return {
        level: incompatible ? "incompatible" : differences.length === 0 ? "exact" : "partial",
        differences,
        affectedGroups: ALL_WEIGHT_GROUPS.filter((group) => affected.has(group)),
    };
}
