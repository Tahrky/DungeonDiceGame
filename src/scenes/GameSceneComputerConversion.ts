import { GameSceneMovement } from "./GameSceneMovement";
import {
    convertReservedSymbols,
    getAvailableSymbolCount,
} from "../game/diceResources";
import {
    canUseActionThisTurn,
    getAttackCost,
    getGridDistance,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import type { DiceSymbol, PlacedMonster, Position } from "../types/GameTypes";
import { getInvokedMonsterCount } from "../game/matchRules";
import {
    chooseBotObjective,
    chooseSymbolConversion,
    findObjectiveMovement,
    scoreMonsterForProfile,
} from "../game/botStrategy";

export abstract class GameSceneComputerConversion extends GameSceneMovement {
    protected abstract findComputerPlacement(): {
        position: Position;
        cells: Position[];
    } | null;

    protected abstract scoreComputerAttack(
        attacker: PlacedMonster,
        attackIndex: number,
        target: Position,
        cells: readonly Position[],
        cost: number,
    ): number;

    protected convertComputerSymbols(): void {
        const reserve = this.diceReserves[2];
        while (true) {
            const choice = chooseSymbolConversion(
                reserve,
                this.getComputerConversionOpportunities(),
                this.getProtectedComputerSymbolCounts(),
            );
            if (!choice) return;
            if (!convertReservedSymbols(reserve, choice.sourceSymbols, choice.targetSymbol)) {
                throw new Error("La conversion de symboles choisie par le bot a échoué.");
            }
        }
    }

    private getComputerConversionOpportunities(): Record<DiceSymbol, number> {
        const opportunities: Record<DiceSymbol, number> = {
            invocation: 0,
            attack: 0,
            movement: 0,
        };
        const reserve = this.diceReserves[2];
        for (const symbol of ["invocation", "attack", "movement"] as const) {
            reserve[symbol]++;
            try {
                opportunities[symbol] =
                    symbol === "invocation"
                        ? this.getComputerInvocationOpportunity()
                        : symbol === "attack"
                          ? this.getComputerAttackOpportunity()
                          : this.getComputerMovementOpportunity();
            } finally {
                reserve[symbol]--;
            }
        }
        return opportunities;
    }

    private getComputerInvocationOpportunity(): number {
        if (
            getInvokedMonsterCount(this.placedMonsters, 2) >=
                this.gameConfiguration.maxMonstersPerPlayer ||
            !this.findComputerPlacement()
        ) {
            return 0;
        }

        const availableInvocation = getAvailableSymbolCount(
            "invocation",
            this.rolledDice,
            this.diceReserves[2],
        );
        return Math.max(
            0,
            ...this.getDeckMonsters(2)
                .filter((monster) => monster.cost === availableInvocation)
                .map((monster) =>
                    Math.max(1, scoreMonsterForProfile(monster, this.opponentProfile) + 1),
                ),
        );
    }

    private getComputerAttackOpportunity(): number {
        let bestScore = 0;
        for (const attacker of this.placedMonsters) {
            if (attacker.owner !== 2 || attacker.currentHp <= 0) continue;
            for (const attackIndex of attacker.monster.attacks.keys()) {
                if (!this.canUseMonsterAttack(attacker, attackIndex)) continue;
                const attack = attacker.monster.attacks[attackIndex];
                if (!attack) continue;
                const cost = getAttackCost(
                    attack,
                    attacker.turnBuffs?.attackCostReduction ?? 0,
                );
                if (
                    cost !==
                    getAvailableSymbolCount(
                        "attack",
                        this.rolledDice,
                        this.diceReserves[2],
                    )
                ) {
                    continue;
                }
                for (const target of this.getAttackCandidateCells(attacker.id, attackIndex)) {
                    if (!this.canAttackTarget(attacker.id, attackIndex, target)) continue;
                    bestScore = Math.max(
                        bestScore,
                        this.scoreComputerAttack(
                            attacker,
                            attackIndex,
                            target,
                            this.getAttackPreviewCells(attacker.id, attackIndex, target),
                            cost,
                        ),
                    );
                }
            }
        }
        return bestScore;
    }

    private getComputerMovementOpportunity(): number {
        const movementCount = getAvailableSymbolCount(
            "movement",
            this.rolledDice,
            this.diceReserves[2],
        );
        let bestScore = 0;
        for (const monster of this.placedMonsters) {
            if (
                monster.owner !== 2 ||
                monster.currentHp <= 0 ||
                !canUseActionThisTurn(
                    monster.movementsUsedThisTurn,
                    getMovementActionsPerTurn(monster.monster),
                ) ||
                getMovementCost(
                    monster.monster,
                    monster.turnBuffs?.movementCostReduction ?? 0,
                ) !== movementCount
            ) {
                continue;
            }
            const movement = this.findComputerMovement(monster);
            if (!movement) continue;
            const enemyPositions = this.placedMonsters
                .filter((placed) => placed.owner === 1 && placed.currentHp > 0)
                .map((placed) => placed.position);
            const enemyProgress = enemyPositions.length
                ? Math.min(
                      ...enemyPositions.map((enemy) => getGridDistance(monster.position, enemy)),
                  ) -
                  Math.min(
                      ...enemyPositions.map((enemy) =>
                          getGridDistance(movement.position, enemy),
                      ),
                  )
                : 0;
            bestScore = Math.max(
                bestScore,
                movement.routeProgress * 100 +
                    (getGridDistance(monster.position, this.startingPositions[1]) -
                        getGridDistance(movement.position, this.startingPositions[1])) *
                        10 +
                    enemyProgress * 6,
            );
        }
        return bestScore;
    }

    private getProtectedComputerSymbolCounts(): Record<DiceSymbol, number> {
        const protectedCounts: Record<DiceSymbol, number> = {
            invocation: 0,
            attack: 0,
            movement: 0,
        };
        const reserve = this.diceReserves[2];

        if (
            getInvokedMonsterCount(this.placedMonsters, 2) <
                this.gameConfiguration.maxMonstersPerPlayer &&
            this.findComputerPlacement()
        ) {
            const invocationCount = getAvailableSymbolCount(
                "invocation",
                this.rolledDice,
                reserve,
            );
            const nextAffordable = this.getDeckMonsters(2)
                .filter((monster) => monster.cost <= invocationCount)
                .reduce((lowest, monster) => Math.min(lowest, monster.cost), Infinity);
            if (Number.isFinite(nextAffordable)) protectedCounts.invocation = nextAffordable;
        }

        for (const attacker of this.placedMonsters) {
            if (attacker.owner !== 2 || attacker.currentHp <= 0) continue;
            for (const attackIndex of attacker.monster.attacks.keys()) {
                if (
                    !this.canUseMonsterAttack(attacker, attackIndex) ||
                    !this.hasComputerAttackTarget(attacker, attackIndex)
                ) {
                    continue;
                }
                const attack = attacker.monster.attacks[attackIndex];
                if (!attack) continue;
                const cost = getAttackCost(
                    attack,
                    attacker.turnBuffs?.attackCostReduction ?? 0,
                );
                protectedCounts.attack =
                    protectedCounts.attack === 0
                        ? cost
                        : Math.min(protectedCounts.attack, cost);
            }
        }

        for (const monster of this.placedMonsters) {
            if (
                monster.owner !== 2 ||
                monster.currentHp <= 0 ||
                !this.canAffordMovement(monster) ||
                !this.findComputerMovement(monster)
            ) {
                continue;
            }
            const cost = getMovementCost(
                monster.monster,
                monster.turnBuffs?.movementCostReduction ?? 0,
            );
            protectedCounts.movement =
                protectedCounts.movement === 0
                    ? cost
                    : Math.min(protectedCounts.movement, cost);
        }

        return protectedCounts;
    }

    private hasComputerAttackTarget(attacker: PlacedMonster, attackIndex: number): boolean {
        return this.getAttackCandidateCells(attacker.id, attackIndex).some((target) =>
            this.canAttackTarget(attacker.id, attackIndex, target),
        );
    }

    private findComputerMovement(monster: PlacedMonster) {
        const ownedCells = this.placedMonsters
            .filter((placed) => placed.owner === 2)
            .flatMap((placed) => placed.cells);
        const enemyPositions = this.placedMonsters
            .filter((placed) => placed.owner === 1 && placed.currentHp > 0)
            .map((placed) => placed.position);
        return findObjectiveMovement(
            this.getMovementOptions(monster, monster.position),
            ownedCells,
            chooseBotObjective(
                this.opponentProfile,
                monster.position,
                this.startingPositions[1],
                enemyPositions,
            ),
            enemyPositions,
        );
    }
}
