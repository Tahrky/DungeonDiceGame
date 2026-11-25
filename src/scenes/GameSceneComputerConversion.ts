import { GameSceneComputerBase, type ComputerAttackOption } from "./GameSceneComputerBase";
import { convertReservedSymbols } from "../game/diceResources";
import { getGridDistance } from "../game/geometry";
import { getInvokedMonsterCount } from "../game/matchRules";
import {
    chooseSymbolConversion,
    getLowestProtectedCost,
    scoreMonsterForProfile,
} from "../game/botStrategy";
import type { DiceSymbol, Position } from "../types/GameTypes";

function getNearestDistance(position: Position, targets: readonly Position[]): number {
    return Math.min(...targets.map((target) => getGridDistance(position, target)));
}

export abstract class GameSceneComputerConversion extends GameSceneComputerBase {
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
        return {
            invocation: this.withExtraComputerSymbol("invocation", () =>
                this.getComputerInvocationOpportunity(),
            ),
            attack: this.withExtraComputerSymbol("attack", () =>
                this.getComputerAttackOpportunity(),
            ),
            movement: this.withExtraComputerSymbol("movement", () =>
                this.getComputerMovementOpportunity(),
            ),
        };
    }

    private withExtraComputerSymbol(symbol: DiceSymbol, evaluate: () => number): number {
        const reserve = this.diceReserves[2];
        reserve[symbol]++;
        try {
            return evaluate();
        } finally {
            reserve[symbol]--;
        }
    }

    private getComputerInvocationOpportunity(): number {
        const invocationBonus = getInvokedMonsterCount(this.placedMonsters, 2) === 0 ? 2 : 0;
        if (!this.canDeployComputerMonster()) return 0;

        return Math.max(
            0,
            ...this.getDeployableMonsters().map(
                (monster) =>
                    Math.max(1, scoreMonsterForProfile(monster, this.opponentProfile) + 1) +
                    invocationBonus,
            ),
        );
    }

    private getComputerAttackOpportunity(): number {
        let bestScore = 0;
        for (const { score } of this.getComputerAttackChoices()) {
            bestScore = Math.max(bestScore, score);
        }
        return bestScore;
    }

    private getComputerMovementOpportunity(): number {
        const enemyPositions = this.getEnemyPositions();
        const isHunting = this.getComputerTactic() === "hunt" && enemyPositions.length > 0;
        const enemyStart = this.startingPositions[1];
        let bestScore = 0;
        for (const monster of this.getLivingMonsters(2)) {
            if (!this.canAffordMovement(monster)) continue;

            const movement = this.findComputerMovement(monster);
            if (!movement) continue;
            const enemyProgress = isHunting
                ? getNearestDistance(monster.position, enemyPositions) -
                  getNearestDistance(movement.position, enemyPositions)
                : 0;
            bestScore = Math.max(
                bestScore,
                movement.routeProgress * 100 +
                    (getGridDistance(monster.position, enemyStart) -
                        getGridDistance(movement.position, enemyStart)) *
                        10 +
                    enemyProgress * 6,
            );
        }
        return bestScore;
    }

    private getProtectedComputerSymbolCounts(): Record<DiceSymbol, number> {
        return {
            invocation: this.getProtectedInvocationCount(),
            attack: this.getProtectedAttackCount(),
            movement: this.getProtectedMovementCount(),
        };
    }

    private getProtectedInvocationCount(): number {
        if (!this.canDeployComputerMonster()) return 0;

        const costs = this.getDeployableMonsters().map(({ cost }) => cost);
        return costs.length > 0 ? Math.min(...costs) : 0;
    }

    private getProtectedAttackCount(): number {
        return getLowestProtectedCost(
            this.getComputerAttackOptions()
                .filter((option) => this.hasComputerAttackTarget(option))
                .map(({ cost }) => cost),
        );
    }

    private getProtectedMovementCount(): number {
        return getLowestProtectedCost(
            this.getLivingMonsters(2)
                .filter(
                    (monster) =>
                        this.canAffordMovement(monster) && this.findComputerMovement(monster),
                )
                .map((monster) => this.getMonsterMovementCost(monster)),
        );
    }

    private hasComputerAttackTarget({ attacker, attackIndex }: ComputerAttackOption): boolean {
        return this.getAttackCandidateCells(attacker.id, attackIndex).some((target) =>
            this.canAttackTarget(attacker.id, attackIndex, target),
        );
    }
}
