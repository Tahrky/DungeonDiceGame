export interface MonsterAttackBalance {
    name: string;
    cost: number;
    directDamage: number;
    damagePerTarget: number;
    expectedDamagePerUse: number;
    expectedFriendlyDamagePerUse: number;
    netDamagePerUse: number;
    supportValuePerUse: number;
    damagePerAttackResource: number;
    rangeControlScore: number;
    maximumReach: number;
    expectedEnemyHits: number;
}

export interface MonsterEconomy {
    standardEntryCost: number;
    fullFirstTurnCost: number;
    averageAttackCostPerTurn: number;
    averageMovementCostPerTurn: number;
    averageOperatingCostPerTurn: number;
    grossEquivalentCostPerTurn: number;
    grossEquivalentPressurePercent: number;
    invocationEfficiency: number;
    longTermDamageEfficiency: number;
}

export interface MonsterBalance {
    id: string;
    name: string;
    summonCost: number;
    hp: number;
    armor: number;
    averageAttacksToEliminate: number | null;
    averageDamagePerAttack: number | null;
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
    economy: MonsterEconomy;
    bestAttackName: string | null;
    attacks: MonsterAttackBalance[];
}
