import type { Monster } from "../types/GameTypes";
import { MONSTERS } from "../data/monsters";

const OPTIONS = {
    boardWidth: 19,
    boardHeight: 13,
    resourcesPerTurn: 5,
    resourceTypes: 3,
    conversionInput: 2,
    conversionOutput: 1,
    movementMetric: "manhattan",
    lineUsesEightDirections: true,
    directionalAreaUsesEightDirections: false,
    includeCasterInSelfRadius: false,
    enemyDensity: 0.15,
    allyDensity: 0.1,
    referenceEnemyHp: 5,
    dotHorizonTurns: 3,
    backstabProbability: 0.25,
    friendlyFireWeight: 0.75,
    healEffectiveness: 0.65,
    cleanseValue: 1,
    attackDamageBuffValue: 1,
    attackCostReductionValue: 1,
    movementRangeBonusValue: 0.75,
    movementCostReductionValue: 1,
    cooldownReductionValue: 1.5,
    buffedAttacksPerTarget: 1,
    buffedMovesPerTarget: 1,
    supportReferenceValue: 5,
    movementReferenceCells: 40,
    areaReferenceCells: 25,
    analysisHorizon: 12,
    invocationEfficiencyHorizon: 5,
} as const;

export const BALANCE_WEIGHTS = {
    durability: 0.20,
    offense: 0.25,
    rangeControl: 0.15,
    mobility: 0.15,
    utility: 0.15,
    actionEconomy: 0.10,
} as const;

const CARDINAL_DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];
const EIGHT_DIRECTIONS = [
    ...CARDINAL_DIRECTIONS,
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
];

export interface MonsterAttackBalance {
    name: string;
    cost: number;
    directDamage: number;
    expectedDamagePerUse: number;
    expectedFriendlyDamagePerUse: number;
    netDamagePerUse: number;
    supportValuePerUse: number;
    damagePerAttackResource: number;
    rangeControlScore: number;
    maximumReach: number;
    expectedEnemyHits: number;
}

export interface MonsterBalance {
    id: string;
    name: string;
    summonCost: number;
    hp: number;
    armor: number;
    averageAttacksToEliminate: number | null;
    movementRange: number;
    scores: {
        durability: number;
        offense: number;
        rangeControl: number;
        mobility: number;
        utility: number;
        actionEconomy: number;
        total: number;
    };
    economy: {
        standardEntryCost: number;
        fullFirstTurnCost: number;
        averageAttackCostPerTurn: number;
        averageMovementCostPerTurn: number;
        averageOperatingCostPerTurn: number;
        grossEquivalentCostPerTurn: number;
        grossEquivalentPressurePercent: number;
        invocationEfficiency: number;
        longTermDamageEfficiency: number;
    };
    bestAttackName: string | null;
    attacks: MonsterAttackBalance[];
}

interface Geometry {
    known: boolean;
    patternType: string;
    averageCoverageCells: number;
    averageMaxAffectedCells: number;
    rangeControlScore: number;
    maximumReach: number;
    singleTarget: boolean;
}

interface Plan {
    totalUses: number;
    totalAttackCost: number;
    totalExpectedDamage: number;
    totalSupportValue: number;
    averageUsesPerTurn: number;
    averageAttackCostPerTurn: number;
    averageExpectedDamagePerTurn: number;
    averageSupportValuePerTurn: number;
    firstTurnAttackCost: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function getMonsterArmor(monster: Pick<Monster, "armor">): number {
    return typeof monster.armor === "number" && Number.isFinite(monster.armor)
        ? Math.max(0, monster.armor)
        : 0;
}

export function calculateEffectiveDamage(attackDamage: number, armor: number | null | undefined): number {
    const safeAttackDamage = Number.isFinite(attackDamage) ? Math.max(0, attackDamage) : 0;
    const safeArmor =
        typeof armor === "number" && Number.isFinite(armor) ? Math.max(0, armor) : 0;
    return Math.max(0, safeAttackDamage - safeArmor);
}

export function calculateAttacksNeeded(
    hp: number,
    armor: number | null | undefined,
    attackDamage: number,
): number | null {
    const effectiveDamage = calculateEffectiveDamage(attackDamage, armor);
    if (effectiveDamage <= 0) return null;
    return Math.ceil(Math.max(0, hp) / effectiveDamage);
}

export function calculateAverageAttacksNeeded(
    hp: number,
    armor: number | null | undefined,
    representativeDamages: readonly number[],
): number | null {
    const values = representativeDamages
        .map((damage) => calculateAttacksNeeded(hp, armor, damage))
        .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    if (values.length !== representativeDamages.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateMonsterAverageAttacks(
    monster: Monster,
    attackCatalog: readonly Monster[] = MONSTERS,
): number | null {
    const armor = getMonsterArmor(monster);
    let weightedSum = 0;
    let totalWeight = 0;

    for (const attacker of attackCatalog) {
        for (const attack of attacker.attacks) {
            if (
                attack.targetsAlliesOnly ||
                attack.healAmount !== undefined ||
                attack.damage <= 0
            ) {
                continue;
            }
            const availability =
                (attack.usesPerTurn ?? 1) /
                (1 +
                    (attack.initialCooldownTurns ?? 0) * 0.5 +
                    (attack.cooldownTurns ?? 0) * 0.25);
            const weight = availability / Math.max(attack.cost, 0.25);
            const attacksNeeded = calculateAttacksNeeded(monster.hp, armor, attack.damage);
            weightedSum += attacksNeeded === null ? Number.POSITIVE_INFINITY * weight : attacksNeeded * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight <= 0) return null;
    const average = weightedSum / totalWeight;
    return Number.isFinite(average) ? average : null;
}

function inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < OPTIONS.boardWidth && y < OPTIONS.boardHeight;
}

function circleCells(x: number, y: number, radius: number, includeCenter: boolean): Set<string> {
    const cells = new Set<string>();
    for (
        let cy = Math.max(0, y - radius);
        cy <= Math.min(OPTIONS.boardHeight - 1, y + radius);
        cy++
    ) {
        for (
            let cx = Math.max(0, x - radius);
            cx <= Math.min(OPTIONS.boardWidth - 1, x + radius);
            cx++
        ) {
            const dx = cx - x;
            const dy = cy - y;
            if (dx * dx + dy * dy <= radius * radius && (includeCenter || dx !== 0 || dy !== 0)) {
                cells.add(`${cx},${cy}`);
            }
        }
    }
    return cells;
}

function attackGeometry(pattern: Monster["attacks"][number]["pattern"]): Geometry {
    let coverageSum = 0;
    let impactSum = 0;
    let maximumReach = 0;
    let singleTarget = false;
    let known = true;

    for (let oy = 0; oy < OPTIONS.boardHeight; oy++) {
        for (let ox = 0; ox < OPTIONS.boardWidth; ox++) {
            const coverage = new Set<string>();
            let maxAffected = 0;

            switch (pattern.type) {
                case "adjacent":
                    singleTarget = true;
                    for (const direction of CARDINAL_DIRECTIONS) {
                        const x = ox + direction.x;
                        const y = oy + direction.y;
                        if (inside(x, y)) coverage.add(`${x},${y}`);
                    }
                    maxAffected = coverage.size > 0 ? 1 : 0;
                    maximumReach = Math.max(maximumReach, 1);
                    break;
                case "radius": {
                    singleTarget = true;
                    const range = Math.max(0, pattern.range);
                    for (const cell of circleCells(ox, oy, range, false)) coverage.add(cell);
                    maxAffected = coverage.size > 0 ? 1 : 0;
                    maximumReach = Math.max(maximumReach, range);
                    break;
                }
                case "selfRadius": {
                    const range = Math.max(0, pattern.range);
                    const cells = circleCells(ox, oy, range, OPTIONS.includeCasterInSelfRadius);
                    for (const cell of cells) coverage.add(cell);
                    maxAffected = cells.size;
                    maximumReach = Math.max(maximumReach, range);
                    break;
                }
                case "line": {
                    const range = Math.max(0, pattern.range);
                    const length = Math.max(1, pattern.length ?? 1);
                    const directions =
                        pattern.allDirections && OPTIONS.lineUsesEightDirections
                            ? EIGHT_DIRECTIONS
                            : CARDINAL_DIRECTIONS;
                    for (const direction of directions) {
                        for (let start = 1; start <= range; start++) {
                            let affected = 0;
                            for (let offset = 0; offset < length; offset++) {
                                const x = ox + direction.x * (start + offset);
                                const y = oy + direction.y * (start + offset);
                                if (inside(x, y)) {
                                    coverage.add(`${x},${y}`);
                                    affected++;
                                }
                            }
                            maxAffected = Math.max(maxAffected, affected);
                        }
                    }
                    maximumReach = Math.max(maximumReach, range + length - 1);
                    break;
                }
                case "directionalArea": {
                    const width = Math.max(1, pattern.width);
                    const depth = Math.max(1, pattern.depth);
                    const sideStart = -Math.floor((width - 1) / 2);
                    for (const direction of CARDINAL_DIRECTIONS) {
                        const side = { x: -direction.y, y: direction.x };
                        for (let forward = 1; forward <= depth; forward++) {
                            let affected = 0;
                            for (let lateral = 0; lateral < width; lateral++) {
                                const offset = sideStart + lateral;
                                const x = ox + direction.x * forward + side.x * offset;
                                const y = oy + direction.y * forward + side.y * offset;
                                if (inside(x, y)) {
                                    coverage.add(`${x},${y}`);
                                    affected++;
                                }
                            }
                            maxAffected = Math.max(maxAffected, affected);
                        }
                    }
                    maximumReach = Math.max(maximumReach, depth);
                    break;
                }
                default:
                    known = false;
            }
            coverageSum += coverage.size;
            impactSum += maxAffected;
        }
    }

    const positions = OPTIONS.boardWidth * OPTIONS.boardHeight;
    const averageCoverageCells = coverageSum / positions;
    const averageMaxAffectedCells = impactSum / positions;
    const coverageScore = 10 * Math.sqrt(clamp(averageCoverageCells / positions, 0, 1));
    const impactScore =
        10 * Math.sqrt(clamp(averageMaxAffectedCells / OPTIONS.areaReferenceCells, 0, 1));
    return {
        known,
        patternType: pattern.type,
        averageCoverageCells,
        averageMaxAffectedCells,
        rangeControlScore: known ? clamp(0.6 * coverageScore + 0.4 * impactScore, 0, 10) : 0,
        maximumReach,
        singleTarget,
    };
}

function expectedHits(geometry: Geometry, density: number): number {
    if (!geometry.known || geometry.averageCoverageCells <= 0) return 0;
    const atLeastOneTarget = 1 - Math.pow(1 - clamp(density, 0, 1), geometry.averageCoverageCells);
    if (geometry.singleTarget) return clamp(atLeastOneTarget, 0, 1);
    if (geometry.patternType === "selfRadius") return geometry.averageMaxAffectedCells * density;
    const expectedTargets = geometry.averageMaxAffectedCells * density;
    return (
        atLeastOneTarget * Math.min(geometry.averageMaxAffectedCells, Math.max(1, expectedTargets))
    );
}

function analyzeMonsterAttack(
    monster: Monster,
    attack: Monster["attacks"][number],
): MonsterAttackBalance {
    const geometry = attackGeometry(attack.pattern);
    const enemyHits = attack.targetsAlliesOnly ? 0 : expectedHits(geometry, OPTIONS.enemyDensity);
    const isArea = !geometry.singleTarget;
    let allyHits = 0;
    if (attack.hitsAllies && isArea) {
        allyHits =
            geometry.patternType === "selfRadius" ||
            geometry.patternType === "line" ||
            geometry.patternType === "directionalArea"
                ? geometry.averageMaxAffectedCells * OPTIONS.allyDensity
                : expectedHits(geometry, OPTIONS.allyDensity);
    }

    const directDamage =
        Math.max(0, attack.damage) +
        (monster.bonusDamageFromBehind ?? 0) * OPTIONS.backstabProbability;
    const dotDamage =
        attack.statusEffect?.type === "damageOverTime"
            ? Math.min(
                  attack.statusEffect.damagePerTurn * OPTIONS.dotHorizonTurns,
                  Math.max(0, OPTIONS.referenceEnemyHp - directDamage),
              )
            : 0;
    const damagePerTarget = directDamage + dotDamage;
    const expectedDamagePerUse = damagePerTarget * enemyHits;
    const expectedFriendlyDamagePerUse = attack.hitsAllies
        ? (Math.max(0, attack.damage) + dotDamage) * allyHits
        : 0;
    const netDamagePerUse = Math.max(
        0,
        expectedDamagePerUse - expectedFriendlyDamagePerUse * OPTIONS.friendlyFireWeight,
    );

    let supportValue = 0;
    const allyTargetChance = attack.targetsSelf
        ? 1
        : 1 - Math.pow(1 - OPTIONS.allyDensity, geometry.averageCoverageCells);
    if (attack.healAmount)
        supportValue += attack.healAmount * OPTIONS.healEffectiveness * allyTargetChance;
    if (attack.clearsStatusEffects) supportValue += OPTIONS.cleanseValue * allyTargetChance;
    if (attack.attackDamageBonus) {
        supportValue +=
            attack.attackDamageBonus *
            OPTIONS.attackDamageBuffValue *
            OPTIONS.buffedAttacksPerTarget *
            allyTargetChance;
    }
    if (attack.attackCostReduction) {
        supportValue +=
            attack.attackCostReduction *
            OPTIONS.attackCostReductionValue *
            OPTIONS.buffedAttacksPerTarget *
            allyTargetChance;
    }
    if (attack.movementRangeBonus) {
        supportValue +=
            attack.movementRangeBonus *
            OPTIONS.movementRangeBonusValue *
            OPTIONS.buffedMovesPerTarget *
            allyTargetChance;
    }
    if (attack.movementCostReduction) {
        supportValue +=
            attack.movementCostReduction *
            OPTIONS.movementCostReductionValue *
            OPTIONS.buffedMovesPerTarget *
            allyTargetChance;
    }
    if (attack.cooldownReduction) {
        supportValue +=
            attack.cooldownReduction * OPTIONS.cooldownReductionValue * allyTargetChance;
    }

    return {
        name: attack.name,
        cost: attack.cost,
        directDamage: attack.damage,
        expectedDamagePerUse,
        expectedFriendlyDamagePerUse,
        netDamagePerUse,
        supportValuePerUse: supportValue,
        damagePerAttackResource: attack.cost > 0 ? netDamagePerUse / attack.cost : 0,
        rangeControlScore: geometry.rangeControlScore,
        maximumReach: geometry.maximumReach,
        expectedEnemyHits: enemyHits,
    };
}

function simulatePlan(
    monster: Monster,
    attacks: Monster["attacks"],
    analyses: MonsterAttackBalance[],
    mode: "offense" | "support" | "combined",
): Plan {
    const analysisByName = new Map(analyses.map((attack) => [attack.name, attack]));
    const readyAtTurn = new Map(
        attacks.map((attack) => [attack.name, 1 + (attack.initialCooldownTurns ?? 0)]),
    );
    let totalUses = 0;
    let totalAttackCost = 0;
    let totalExpectedDamage = 0;
    let totalSupportValue = 0;
    let firstTurnAttackCost = 0;

    for (let turn = 1; turn <= OPTIONS.analysisHorizon; turn++) {
        const usesThisTurn = new Map<string, number>();
        const slots = Math.max(1, monster.attackActionsPerTurn ?? 1);
        for (let slot = 0; slot < slots; slot++) {
            const chosen = attacks
                .filter((attack) => {
                    const used = usesThisTurn.get(attack.name) ?? 0;
                    return (
                        (readyAtTurn.get(attack.name) ?? 1) <= turn &&
                        (attack.usesPerTurn === undefined || used < attack.usesPerTurn)
                    );
                })
                .map((attack) => {
                    const analysis = analysisByName.get(attack.name);
                    if (!analysis) return null;
                    const value =
                        mode === "offense"
                            ? analysis.netDamagePerUse
                            : mode === "support"
                              ? analysis.supportValuePerUse
                              : analysis.netDamagePerUse + analysis.supportValuePerUse;
                    return value > 0
                        ? {
                              attack,
                              analysis,
                              value,
                              valuePerCost: value / Math.max(attack.cost, 0.25),
                          }
                        : null;
                })
                .filter((item): item is NonNullable<typeof item> => item !== null)
                .sort((a, b) => b.valuePerCost - a.valuePerCost || b.value - a.value);
            const best = chosen[0];
            if (!best) break;
            totalUses++;
            totalAttackCost += best.attack.cost;
            totalExpectedDamage += best.analysis.netDamagePerUse;
            totalSupportValue += best.analysis.supportValuePerUse;
            usesThisTurn.set(best.attack.name, (usesThisTurn.get(best.attack.name) ?? 0) + 1);
            if (turn === 1) firstTurnAttackCost += best.attack.cost;
            const cooldown = best.attack.cooldownTurns ?? 0;
            readyAtTurn.set(best.attack.name, cooldown <= 0 ? turn : turn + cooldown + 1);
        }
    }

    return {
        totalUses,
        totalAttackCost,
        totalExpectedDamage,
        totalSupportValue,
        averageUsesPerTurn: totalUses / OPTIONS.analysisHorizon,
        averageAttackCostPerTurn: totalAttackCost / OPTIONS.analysisHorizon,
        averageExpectedDamagePerTurn: totalExpectedDamage / OPTIONS.analysisHorizon,
        averageSupportValuePerTurn: totalSupportValue / OPTIONS.analysisHorizon,
        firstTurnAttackCost,
    };
}

function averageMovementCells(range: number): number {
    let reachableTotal = 0;
    for (let oy = 0; oy < OPTIONS.boardHeight; oy++) {
        for (let ox = 0; ox < OPTIONS.boardWidth; ox++) {
            for (let y = 0; y < OPTIONS.boardHeight; y++) {
                for (let x = 0; x < OPTIONS.boardWidth; x++) {
                    if ((x !== ox || y !== oy) && Math.abs(x - ox) + Math.abs(y - oy) <= range) {
                        reachableTotal++;
                    }
                }
            }
        }
    }
    return reachableTotal / (OPTIONS.boardWidth * OPTIONS.boardHeight);
}

export function calculateMobilityScore(monster: Monster): number {
    const movementActions = Math.max(1, monster.movementActionsPerTurn ?? 1);
    const movementCost = monster.movementCost ?? 1;
    const reachableCells = averageMovementCells(monster.movementRange);
    const reachRatio = clamp(reachableCells / OPTIONS.movementReferenceCells, 0, 1);
    const costEfficiency = 1 / (1 + Math.max(0, movementCost - 1) * 0.35);
    const actionAvailability = movementActions / (1 + movementActions * 0.25);
    const specialValue =
        (monster.flying ? 0.8 : 0) +
        (monster.canPassHostiles ? 0.6 : 0);
    return clamp(
        10 *
            (0.68 * Math.sqrt(reachRatio) +
                0.22 * costEfficiency +
                0.10 * actionAvailability) +
            specialValue,
        0,
        10,
    );
}

export function calculateActionEconomyScore(
    monster: Monster,
    averageAttackUsesPerTurn?: number,
    averageMovementCostPerTurn?: number,
): number {
    const attackSlots = Math.max(1, monster.attackActionsPerTurn ?? 1);
    const movementActions = Math.max(1, monster.movementActionsPerTurn ?? 1);
    const movementCost = averageMovementCostPerTurn ?? movementActions * (monster.movementCost ?? 1);
    const attackUses =
        averageAttackUsesPerTurn === undefined
            ? monster.attacks.reduce((sum, attack) => {
                  if (attack.initialCooldownTurns && attack.initialCooldownTurns > 0) return sum;
                  const perTurn = attack.usesPerTurn ?? attackSlots;
                  const cooldownPenalty =
                      attack.cooldownTurns && attack.cooldownTurns > 0
                          ? 1 / (attack.cooldownTurns + 1)
                          : 1;
                  return sum + Math.min(perTurn, attackSlots) * cooldownPenalty;
              }, 0) / Math.max(1, monster.attacks.length)
            : averageAttackUsesPerTurn;
    const attackCost = monster.attacks.reduce((sum, attack) => {
        const usable = attack.initialCooldownTurns === undefined ||
            attack.initialCooldownTurns === 0;
        return usable ? sum + attack.cost : sum;
    }, 0);
    const resourcePressure = clamp(
        (attackCost / Math.max(1, monster.attacks.length) + movementCost) /
            OPTIONS.resourcesPerTurn,
        0,
        1,
    );
    const realizableActions = clamp(
        (attackUses + movementActions) / (attackSlots + movementActions),
        0,
        1,
    );
    const conversionEfficiency = resourcePressure > 0
        ? clamp(realizableActions / (1 + resourcePressure), 0, 1)
        : realizableActions;
    return clamp(10 * conversionEfficiency, 0, 10);
}

export function calculateUtilityScore(monster: Monster, attackSupportValue = 0): number {
    let inherentSupport = attackSupportValue;
    if (attackSupportValue === 0) {
        for (const attack of monster.attacks) {
            if (attack.initialCooldownTurns && attack.initialCooldownTurns > 0) continue;
            const availability =
                (attack.usesPerTurn ?? 1) /
                (1 + (attack.cooldownTurns ?? 0));
            if (attack.healAmount) {
                inherentSupport += attack.healAmount * OPTIONS.healEffectiveness * availability;
            }
            if (attack.clearsStatusEffects) {
                inherentSupport += OPTIONS.cleanseValue * availability;
            }
            if (attack.attackDamageBonus) {
                inherentSupport += attack.attackDamageBonus * OPTIONS.attackDamageBuffValue * availability;
            }
            if (attack.movementRangeBonus) {
                inherentSupport += attack.movementRangeBonus * OPTIONS.movementRangeBonusValue * availability;
            }
            if (attack.cooldownReduction) {
                inherentSupport += attack.cooldownReduction * OPTIONS.cooldownReductionValue * availability;
            }
        }
    }
    const passiveCamouflage =
        monster.id === "thief" ? 1.8 : 0;
    const passiveArmor = getMonsterArmor(monster) > 0 ? 0.25 : 0;
    const defensiveSupport = passiveCamouflage + passiveArmor;
    return clamp(
        (inherentSupport / OPTIONS.supportReferenceValue) * 10 +
            defensiveSupport,
        0,
        10,
    );
}

export function analyzeMonster(monster: Monster): MonsterBalance {
    const attacks = monster.attacks.map((attack) => analyzeMonsterAttack(monster, attack));
    const offensePlan = simulatePlan(monster, monster.attacks, attacks, "offense");
    const supportPlan = simulatePlan(monster, monster.attacks, attacks, "support");
    const combinedPlan = simulatePlan(monster, monster.attacks, attacks, "combined");
    const bestAttack = attacks.reduce<MonsterAttackBalance | undefined>(
        (best, attack) =>
            attack.rangeControlScore > (best?.rangeControlScore ?? -1) ? attack : best,
        undefined,
    );

    const armor = getMonsterArmor(monster);
    const averageAttacksToEliminate = calculateMonsterAverageAttacks(monster);
    const durability =
        armor === 0
            ? clamp((monster.hp / 8) * 10, 0, 10)
            : averageAttacksToEliminate === null
              ? 10
              : clamp((averageAttacksToEliminate / 4.8) * 10, 0, 10);
    const offense =
        offensePlan.totalAttackCost > 0
            ? clamp((2 * offensePlan.totalExpectedDamage) / offensePlan.totalAttackCost, 0, 10)
            : 0;
    const mobility = calculateMobilityScore(monster);
    const utility = calculateUtilityScore(monster, supportPlan.averageSupportValuePerTurn);
    const movementActions = Math.max(1, monster.movementActionsPerTurn ?? 1);
    const movementCost = monster.movementCost ?? 1;
    const averageMovementCostPerTurn = movementActions * movementCost;
    const actionEconomy = calculateActionEconomyScore(
        monster,
        combinedPlan.averageUsesPerTurn,
        averageMovementCostPerTurn,
    );

    const standardAttack = monster.attacks
        .filter((attack) => (attack.initialCooldownTurns ?? 0) === 0)
        .map((attack) => {
            const analysis = attacks.find((item) => item.name === attack.name);
            return {
                attack,
                valuePerCost:
                    ((analysis?.netDamagePerUse ?? 0) + (analysis?.supportValuePerUse ?? 0)) /
                    Math.max(attack.cost, 0.25),
            };
        })
        .sort((a, b) => b.valuePerCost - a.valuePerCost)[0];
    const averageOperatingCostPerTurn =
        combinedPlan.averageAttackCostPerTurn + averageMovementCostPerTurn;
    const invocationDemand = monster.cost / OPTIONS.invocationEfficiencyHorizon;
    const resourceShare = OPTIONS.resourcesPerTurn / OPTIONS.resourceTypes;
    const totalDemand = invocationDemand + averageOperatingCostPerTurn;
    const deficit =
        Math.max(0, invocationDemand - resourceShare) +
        Math.max(0, combinedPlan.averageAttackCostPerTurn - resourceShare) +
        Math.max(0, averageMovementCostPerTurn - resourceShare);
    const grossEquivalentCostPerTurn = totalDemand + deficit;
    const rangeControl = bestAttack?.rangeControlScore ?? 0;
    const total =
        BALANCE_WEIGHTS.durability * durability +
        BALANCE_WEIGHTS.offense * offense +
        BALANCE_WEIGHTS.rangeControl * rangeControl +
        BALANCE_WEIGHTS.mobility * mobility +
        BALANCE_WEIGHTS.utility * utility +
        BALANCE_WEIGHTS.actionEconomy * actionEconomy;

    return {
        id: monster.id,
        name: monster.name,
        summonCost: monster.cost,
        hp: monster.hp,
        armor,
        averageAttacksToEliminate,
        movementRange: monster.movementRange,
        scores: { durability, offense, rangeControl, mobility, utility, actionEconomy, total },
        economy: {
            standardEntryCost: monster.cost + (standardAttack?.attack.cost ?? 0) + movementCost,
            fullFirstTurnCost:
                monster.cost + combinedPlan.firstTurnAttackCost + averageMovementCostPerTurn,
            averageAttackCostPerTurn: combinedPlan.averageAttackCostPerTurn,
            averageMovementCostPerTurn,
            averageOperatingCostPerTurn,
            grossEquivalentCostPerTurn,
            grossEquivalentPressurePercent:
                (100 * grossEquivalentCostPerTurn) / OPTIONS.resourcesPerTurn,
            invocationEfficiency: total / Math.max(1, monster.cost),
            longTermDamageEfficiency:
                grossEquivalentCostPerTurn > 0
                    ? offensePlan.averageExpectedDamagePerTurn / grossEquivalentCostPerTurn
                    : 0,
        },
        bestAttackName: bestAttack?.name ?? null,
        attacks,
    };
}

export function analyzeMonsters(monsters: readonly Monster[]): MonsterBalance[] {
    return monsters
        .map(analyzeMonster)
        .sort((first, second) => second.scores.total - first.scores.total);
}
