import { GameSceneAttackExecution } from "./GameSceneAttackExecution";
import { canUseActionThisTurn, getAttackActionsPerTurn } from "../game/monsterActions";
import type { DiceSymbol, PlacedMonster, Position } from "../types/GameTypes";
import { isMonsterAsleep } from "../game/statusEffects";

interface UsableAttack {
    index: number;
    cost: number;
}

function getDefaultAttack(
    attacks: readonly UsableAttack[],
    availableSymbols: number,
): UsableAttack | undefined {
    if (attacks.length === 1) return attacks[0];
    const totalCost = attacks.reduce((total, { cost }) => total + cost, 0);
    if (availableSymbols >= totalCost) return undefined;
    return [...attacks].sort((first, second) => first.cost - second.cost)[0];
}

export abstract class GameSceneCombatCore extends GameSceneAttackExecution {
    protected startAttack(): void {
        if (!this.canStartSymbolAction("attack") && !this.canStartFreeAttack()) return;
        this.selectedMonster = null;
        this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        this.render();
    }

    protected canStartFreeAttack(): boolean {
        return (
            this.isReadyForAction() &&
            this.getLivingMonsters(this.currentPlayer).some(
                (monster) =>
                    (monster.turnBuffs?.attackCostReduction ?? 0) > 0 &&
                    monster.monster.attacks.some((_, index) =>
                        this.canUseMonsterAttack(monster, index),
                    ),
            )
        );
    }

    protected startMovement(): void {
        if (!this.canStartMovement()) return;
        this.selectedMonster = null;
        this.actionMode = { type: "movement", monsterId: null };
        this.render();
    }

    protected canStartMovement(): boolean {
        return this.isReadyForAction() && this.hasAffordableMovement();
    }

    protected canStartSymbolAction(symbol: DiceSymbol): boolean {
        return this.isReadyForAction() && this.getAvailableSymbols(symbol) > 0;
    }

    private isReadyForAction(): boolean {
        return (
            this.winner === null &&
            this.hasRolled &&
            !this.pendingCells &&
            this.actionMode.type === "idle"
        );
    }

    protected handleBoardAction(position: Position): void {
        if (this.actionMode.type === "attack") {
            this.handleAttackAction(position, this.actionMode.attackerId);
        } else if (this.actionMode.type === "movement") {
            this.handleMovementAction(position, this.actionMode.monsterId);
        }
    }

    protected handleAttackAction(position: Position, attackerId: string | null): void {
        const clickedMonster = this.getLivingMonsterAt(position);
        if (!attackerId) {
            this.selectAttackMonster(clickedMonster);
            return;
        }

        const attacker = this.getLivingMonster(attackerId);
        if (!attacker) return;
        if (this.shouldSelectDifferentAttacker(attacker, clickedMonster)) {
            this.selectAttackMonster(clickedMonster);
            return;
        }

        const attackIndex = this.getSelectedAttackIndex();
        if (attackIndex === null) return;
        this.executeAttack(attacker, attackIndex, position, clickedMonster);
    }

    protected selectAttackMonster(monster: PlacedMonster | undefined): void {
        if (
            monster?.owner !== this.currentPlayer ||
            isMonsterAsleep(monster) ||
            !canUseActionThisTurn(
                monster.attacksUsedThisTurn,
                getAttackActionsPerTurn(monster.monster),
            )
        ) {
            return;
        }

        const usableAttacks = monster.monster.attacks
            .map((attack, index) => ({ index, cost: this.getMonsterAttackCost(monster, attack) }))
            .filter(({ index }) => this.canUseMonsterAttack(monster, index));
        this.actionMode = {
            type: "attack",
            attackerId: monster.id,
            attackIndex:
                getDefaultAttack(usableAttacks, this.getAvailableSymbols("attack"))?.index ?? null,
        };
        this.render();
    }

    protected shouldSelectDifferentAttacker(
        attacker: PlacedMonster,
        clickedMonster: PlacedMonster | undefined,
    ): boolean {
        if (clickedMonster?.owner !== this.currentPlayer || clickedMonster.id === attacker.id) {
            return false;
        }

        const attackIndex = this.getSelectedAttackIndex();
        const selectedAttack =
            attackIndex === null ? undefined : attacker.monster.attacks[attackIndex];
        return !selectedAttack?.hitsAllies && !selectedAttack?.targetsAlliesOnly;
    }

    protected getSelectedAttackIndex(): number | null {
        return this.actionMode.type === "attack" ? this.actionMode.attackIndex : null;
    }
}
