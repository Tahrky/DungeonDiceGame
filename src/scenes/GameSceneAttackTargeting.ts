import { GameSceneInvocation } from "./GameSceneInvocation";
import {
    canAttackEnemyBase,
    isAttackCellInRange,
    isReachableAttackZone,
    type AttackContext,
} from "../game/attackRules";
import { isBoardCell } from "../game/boards";
import { isSamePosition } from "../game/geometry";
import { opposingPlayer } from "../game/matchRules";
import {
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    getAttackActionsPerTurn,
    getAttackZoneOptions,
    type AttackZoneOption,
} from "../game/monsterActions";
import type { MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";
import { isMonsterAsleep } from "../game/statusEffects";

interface UsableAttack {
    attacker: PlacedMonster;
    attack: MonsterAttack;
}

export abstract class GameSceneAttackTargeting extends GameSceneInvocation {
    protected get attackContext(): AttackContext {
        return {
            board: this.board,
            startingPositions: this.startingPositions,
            monsters: this.placedMonsters,
            currentPlayer: this.currentPlayer,
            turn: this.turnNumber,
            allowBaseAttackOnSummonTurn: this.gameConfiguration.allowBaseAttackOnSummonTurn,
            obstacles: this.obstacles,
        };
    }

    protected selectAttack(attackIndex: number): void {
        if (this.actionMode.type !== "attack" || !this.actionMode.attackerId) return;
        if (!this.getUsableAttack(this.actionMode.attackerId, attackIndex)) return;

        this.actionMode = { ...this.actionMode, attackIndex };
        this.render();
    }

    protected canAttackTarget(
        attackerId: string,
        attackIndex: number,
        targetPosition: Position,
    ): boolean {
        return this.findTargetedZone(attackerId, attackIndex, targetPosition) !== undefined;
    }

    protected getAttackRangeCells(attackerId: string, attackIndex: number): Position[] {
        const usable = this.getUsableAttack(attackerId, attackIndex);
        if (!usable) return [];
        const { attacker, attack } = usable;
        return this.getAttackOptions(attacker, attack)
            .filter(
                (option) =>
                    this.isBaseTargetAllowed(attacker, option.target) &&
                    this.isReachableZone(attacker, attack, option),
            )
            .map(({ target }) => target);
    }

    protected getAttackCandidateCells(attackerId: string, attackIndex: number): Position[] {
        const usable = this.getUsableAttack(attackerId, attackIndex);
        if (!usable) return [];
        return this.getAttackOptions(usable.attacker, usable.attack)
            .map(({ target }) => target)
            .filter(
                (cell) =>
                    isBoardCell(this.board, cell) &&
                    this.isBaseTargetAllowed(usable.attacker, cell),
            );
    }

    protected getAttackPreviewCells(
        attackerId: string,
        attackIndex: number,
        targetPosition: Position,
    ): Position[] {
        const targeted = this.findTargetedZone(attackerId, attackIndex, targetPosition);
        if (!targeted) return [];
        const { attacker, attack, cells } = targeted;
        return cells.filter(
            (cell) =>
                isAttackCellInRange(attacker.position, attack, cell) &&
                this.isBaseTargetAllowed(attacker, cell),
        );
    }

    protected canUseMonsterAttack(attacker: PlacedMonster, attackIndex: number): boolean {
        const attack = attacker.monster.attacks[attackIndex];
        return (
            attack !== undefined &&
            attacker.owner === this.currentPlayer &&
            attacker.currentHp > 0 &&
            !isMonsterAsleep(attacker) &&
            canUseActionThisTurn(
                attacker.attacksUsedThisTurn,
                getAttackActionsPerTurn(attacker.monster),
            ) &&
            (attacker.attackCooldowns[attackIndex] ?? 0) === 0 &&
            canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0) &&
            this.getAvailableSymbols("attack") >= this.getMonsterAttackCost(attacker, attack)
        );
    }

    protected canAttackBase(attacker: PlacedMonster): boolean {
        return canAttackEnemyBase(this.attackContext, attacker);
    }

    protected isOpponentStartingPosition(position: Position): boolean {
        return isSamePosition(position, this.startingPositions[opposingPlayer(this.currentPlayer)]);
    }

    protected getAttackZoneForTarget(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        target: Position,
    ): AttackZoneOption | undefined {
        return this.getAttackOptions(attacker, attack).find(
            (option) =>
                isSamePosition(option.target, target) &&
                this.isReachableZone(attacker, attack, option),
        );
    }

    private getUsableAttack(attackerId: string, attackIndex: number): UsableAttack | undefined {
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        return attacker && attack && this.canUseMonsterAttack(attacker, attackIndex)
            ? { attacker, attack }
            : undefined;
    }

    private findTargetedZone(
        attackerId: string,
        attackIndex: number,
        target: Position,
    ): (UsableAttack & { cells: Position[] }) | undefined {
        const usable = this.getUsableAttack(attackerId, attackIndex);
        if (!usable || !this.isBaseTargetAllowed(usable.attacker, target)) return undefined;
        const zone = this.getAttackZoneForTarget(usable.attacker, usable.attack, target);
        return zone && { ...usable, cells: zone.cells };
    }

    private getAttackOptions(attacker: PlacedMonster, attack: MonsterAttack): AttackZoneOption[] {
        return getAttackZoneOptions(
            attacker.position,
            attacker.facing,
            attack.pattern,
            attack.targetsSelf,
        );
    }

    private isBaseTargetAllowed(attacker: PlacedMonster, cell: Position): boolean {
        return this.canAttackBase(attacker) || !this.isOpponentStartingPosition(cell);
    }

    private isReachableZone(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        option: AttackZoneOption,
    ): boolean {
        return isReachableAttackZone(this.attackContext, attacker, attack, option);
    }

    protected abstract canAffordMovement(monster: PlacedMonster): boolean;
    protected abstract hasAffordableMovement(): boolean;
}
