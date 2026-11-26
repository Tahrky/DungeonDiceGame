import type { Monster, MonsterAttack } from "../../types/GameTypes";
import { analyzeAttackGeometry, expectedHits, type AttackGeometry } from "./geometry";
import { MONSTER_BALANCE_OPTIONS as OPTIONS } from "../../data/configuration";
import { getAttackSupportValue } from "./support";
import type { MonsterAttackBalance } from "./types";

const FIXED_FOOTPRINT_PATTERNS = new Set(["selfRadius", "line", "directionalArea"]);

function getAllyHits(attack: MonsterAttack, geometry: AttackGeometry): number {
    if (!attack.hitsAllies || geometry.singleTarget) return 0;
    return FIXED_FOOTPRINT_PATTERNS.has(geometry.patternType)
        ? geometry.averageMaxAffectedCells * OPTIONS.allyDensity
        : expectedHits(geometry, OPTIONS.allyDensity);
}

function getDotDamage(attack: MonsterAttack, directDamage: number): number {
    const effect = attack.statusEffect;
    if (effect?.type !== "damageOverTime") return 0;
    return Math.min(
        effect.damagePerTurn * OPTIONS.dotHorizonTurns,
        Math.max(0, OPTIONS.referenceEnemyHp - directDamage),
    );
}

export function analyzeMonsterAttack(
    monster: Monster,
    attack: MonsterAttack,
): MonsterAttackBalance {
    const geometry = analyzeAttackGeometry(attack.pattern);
    const enemyHits = attack.targetsAlliesOnly ? 0 : expectedHits(geometry, OPTIONS.enemyDensity);
    const allyHits = getAllyHits(attack, geometry);

    const directDamage =
        Math.max(0, attack.damage) +
        (monster.bonusDamageFromBehind ?? 0) * OPTIONS.backstabProbability;
    const dotDamage = getDotDamage(attack, directDamage);
    const damagePerTarget = directDamage + dotDamage;
    const expectedDamagePerUse = damagePerTarget * enemyHits;
    const expectedFriendlyDamagePerUse = attack.hitsAllies
        ? (Math.max(0, attack.damage) + dotDamage) * allyHits
        : 0;
    const netDamagePerUse = Math.max(
        0,
        expectedDamagePerUse - expectedFriendlyDamagePerUse * OPTIONS.friendlyFireWeight,
    );

    const allyTargetChance = attack.targetsSelf
        ? 1
        : 1 - Math.pow(1 - OPTIONS.allyDensity, geometry.averageCoverageCells);

    return {
        name: attack.name,
        cost: attack.cost,
        directDamage: attack.damage,
        damagePerTarget,
        expectedDamagePerUse,
        expectedFriendlyDamagePerUse,
        netDamagePerUse,
        supportValuePerUse: getAttackSupportValue(attack, allyTargetChance),
        damagePerAttackResource: attack.cost > 0 ? netDamagePerUse / attack.cost : 0,
        rangeControlScore: geometry.rangeControlScore,
        maximumReach: geometry.maximumReach,
        expectedEnemyHits: enemyHits,
    };
}
