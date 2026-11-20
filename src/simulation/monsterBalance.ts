import type { Monster } from "../types/GameTypes";

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
    warnings: string[];
}

export interface MonsterBalance {
    id: string;
    name: string;
    summonCost: number;
    hp: number;
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
    warnings: string[];
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

    const warnings: string[] = [];
    if (!geometry.known) warnings.push(`Pattern « ${attack.pattern.type} » non pris en charge.`);
    if (
        attack.statusEffect?.type === "damageOverTime" &&
        attack.statusEffect.duration === "untilDeath"
    ) {
        warnings.push(
            `Dégâts sur la durée plafonnés à ${OPTIONS.dotHorizonTurns} tours et ${OPTIONS.referenceEnemyHp} PV.`,
        );
    }
    if (attack.hitsAllies && isArea) {
        warnings.push(`Dégâts alliés estimés avec une densité de ${OPTIONS.allyDensity}.`);
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
        warnings,
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

    const durability = clamp((monster.hp / 8) * 10, 0, 10);
    const offense =
        offensePlan.totalAttackCost > 0
            ? clamp((2 * offensePlan.totalExpectedDamage) / offensePlan.totalAttackCost, 0, 10)
            : 0;
    const mobility = clamp(
        10 *
            Math.sqrt(
                clamp(
                    averageMovementCells(monster.movementRange) / OPTIONS.movementReferenceCells,
                    0,
                    1,
                ),
            ) +
            (monster.flying ? 1 : 0) +
            (monster.canPassHostiles ? 0.75 : 0),
        0,
        10,
    );
    const utility = clamp(
        (supportPlan.averageSupportValuePerTurn / OPTIONS.supportReferenceValue) * 10,
        0,
        10,
    );
    const movementActions = Math.max(1, monster.movementActionsPerTurn ?? 1);
    const actionEconomy = clamp(
        ((combinedPlan.averageUsesPerTurn + movementActions) / 4) * 10,
        0,
        10,
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
    const movementCost = monster.movementCost ?? 1;
    const averageMovementCostPerTurn = movementActions * movementCost;
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
        0.2 * durability +
        0.25 * offense +
        0.15 * rangeControl +
        0.15 * mobility +
        0.15 * utility +
        0.1 * actionEconomy;

    const warnings = [...new Set(attacks.flatMap((attack) => attack.warnings))];
    if ((monster.bonusDamageFromBehind ?? 0) > 0) {
        warnings.push(
            `Bonus arrière estimé avec une probabilité de ${OPTIONS.backstabProbability * 100} %.`,
        );
    }
    return {
        id: monster.id,
        name: monster.name,
        summonCost: monster.cost,
        hp: monster.hp,
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
        warnings,
    };
}

export function analyzeMonsters(monsters: readonly Monster[]): MonsterBalance[] {
    return monsters
        .map(analyzeMonster)
        .sort((first, second) => second.scores.total - first.scores.total);
}
