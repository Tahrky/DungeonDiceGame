import { GameSceneAttackExecution } from "./GameSceneAttackExecution";
import { getAvailableSymbolCount } from "../game/diceResources";
import {
    canUseActionThisTurn,
    getAttackActionsPerTurn,
    getAttackCost,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import type { DiceSymbol, PlacedMonster, Position } from "../types/GameTypes";

export abstract class GameSceneCombatCore extends GameSceneAttackExecution {
    protected startAttack(): void {
        if (!this.canStartSymbolAction("attack") && !this.canStartFreeAttack()) return;
        this.selectedMonster = null;
        this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        this.render();
    }

    protected canStartFreeAttack(): boolean {
        return (
            this.winner === null &&
            this.hasRolled &&
            !this.pendingCells &&
            this.actionMode.type === "idle" &&
            this.placedMonsters.some(
                (monster) =>
                    monster.owner === this.currentPlayer &&
                    monster.currentHp > 0 &&
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
        if (
            this.winner !== null ||
            !this.hasRolled ||
            this.pendingCells ||
            this.actionMode.type !== "idle"
        ) {
            return false;
        }

        const movementCount = getAvailableSymbolCount(
            "movement",
            this.rolledDice,
            this.diceReserves[this.currentPlayer],
        );
        return this.placedMonsters.some(
            (monster) =>
                monster.owner === this.currentPlayer &&
                monster.currentHp > 0 &&
                canUseActionThisTurn(
                    monster.movementsUsedThisTurn,
                    getMovementActionsPerTurn(monster.monster),
                ) &&
                getMovementCost(
                    monster.monster,
                    monster.turnBuffs?.movementCostReduction ?? 0,
                ) <= movementCount,
        );
    }

    protected canStartSymbolAction(symbol: DiceSymbol): boolean {
        return (
            this.winner === null &&
            this.hasRolled &&
            !this.pendingCells &&
            this.actionMode.type === "idle" &&
            getAvailableSymbolCount(
                symbol,
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            ) > 0
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
            !canUseActionThisTurn(
                monster.attacksUsedThisTurn,
                getAttackActionsPerTurn(monster.monster),
            )
        ) {
            return;
        }
        const availableAttackSymbols = getAvailableSymbolCount(
            "attack",
            this.rolledDice,
            this.diceReserves[this.currentPlayer],
        );
        const affordableAttacks = monster.monster.attacks
            .map((attack, index) => ({ attack, index }))
            .filter(({ index }) => this.canUseMonsterAttack(monster, index));
        const cannotAffordSeveralAttacks =
            availableAttackSymbols <
            affordableAttacks.reduce(
                (total, { attack }) =>
                    total +
                    getAttackCost(attack, monster.turnBuffs?.attackCostReduction ?? 0),
                0,
            );
        let defaultAttack: (typeof affordableAttacks)[number] | undefined;
        if (affordableAttacks.length === 1) {
            defaultAttack = affordableAttacks[0];
        } else if (cannotAffordSeveralAttacks) {
            defaultAttack = affordableAttacks.reduce<
                (typeof affordableAttacks)[number] | undefined
            >((cheapest, candidate) => {
                if (
                    !cheapest ||
                    getAttackCost(
                        candidate.attack,
                        monster.turnBuffs?.attackCostReduction ?? 0,
                    ) <
                        getAttackCost(
                            cheapest.attack,
                            monster.turnBuffs?.attackCostReduction ?? 0,
                        )
                ) {
                    return candidate;
                }
                return cheapest;
            }, undefined);
        }
        const attackIndex = defaultAttack?.index ?? null;
        this.actionMode = { type: "attack", attackerId: monster.id, attackIndex };
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
