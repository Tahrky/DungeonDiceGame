import { GameSceneInvocation } from "./GameSceneInvocation";
import { isBoardCell } from "../game/boards";
import {
    canAttackBaseThisTurn,
    canAttackMonster,
    canTargetMonsterOwner,
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    getAttackActionsPerTurn,
    getAttackZoneOptions,
    getGridDistance,
    hasLineOfSight,
} from "../game/monsterActions";
import type { Monster, PlacedMonster, Position } from "../types/GameTypes";
import { getAvailableSymbolCount } from "../game/diceResources";

export abstract class GameSceneAttackTargeting extends GameSceneInvocation {
    protected selectAttack(attackIndex: number): void {
        if (this.actionMode.type !== "attack" || !this.actionMode.attackerId) return;
        const attacker = this.getLivingMonster(this.actionMode.attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) return;

        this.actionMode = { ...this.actionMode, attackIndex };
        this.render();
    }

    protected canAttackTarget(
        attackerId: string,
        attackIndex: number,
        targetPosition: Position,
    ): boolean {
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) {
            return false;
        }
        if (this.isOpponentStartingPosition(targetPosition) && !this.canAttackBase(attacker)) {
            return false;
        }

        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition);
        if (!zone) return false;
        return this.isAttackZoneUsable(attacker, attack, zone.cells);
    }

    protected getAttackRangeCells(attackerId: string, attackIndex: number): Position[] {
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) return [];

        const validZones = getAttackZoneOptions(
            attacker.position,
            attacker.facing,
            attack.pattern,
        ).filter(
            (option) =>
                (this.canAttackBase(attacker) || !this.isOpponentStartingPosition(option.target)) &&
                this.isAttackZoneUsable(attacker, attack, option.cells) &&
                this.canSeeAttackTarget(attacker, attack, option.target),
        );
        return validZones.map((option) => option.target);
    }

    protected getAttackCandidateCells(attackerId: string, attackIndex: number): Position[] {
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) return [];

        return getAttackZoneOptions(attacker.position, attacker.facing, attack.pattern)
            .map((option) => option.target)
            .filter(
                (cell) =>
                    isBoardCell(this.board, cell) &&
                    (this.canAttackBase(attacker) || !this.isOpponentStartingPosition(cell)),
            );
    }

    protected getAttackPreviewCells(
        attackerId: string,
        attackIndex: number,
        targetPosition: Position,
    ): Position[] {
        if (!this.canAttackTarget(attackerId, attackIndex, targetPosition)) return [];
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack) return [];
        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition)?.cells ?? [];
        return zone.filter(
            (cell) =>
                this.isAttackCellInRange(attacker.position, attack, cell) &&
                (this.canAttackBase(attacker) || !this.isOpponentStartingPosition(cell)),
        );
    }

    protected canAffordAttack(attack: Monster["attacks"][number]): boolean {
        return (
            getAvailableSymbolCount(
                "attack",
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            ) >= attack.cost
        );
    }

    protected canUseMonsterAttack(attacker: PlacedMonster, attackIndex: number): boolean {
        const attack = attacker.monster.attacks[attackIndex];
        return (
            attack !== undefined &&
            attacker.owner === this.currentPlayer &&
            attacker.currentHp > 0 &&
            canUseActionThisTurn(
                attacker.attacksUsedThisTurn,
                getAttackActionsPerTurn(attacker.monster),
            ) &&
            (attacker.attackCooldowns[attackIndex] ?? 0) === 0 &&
            canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0) &&
            this.canAffordAttack(attack)
        );
    }

    protected isAttackZoneUsable(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        zone: readonly Position[],
    ): boolean {
        if (attack.movesToZone && !this.getSlimeLanding(attacker, attack, zone)) return false;
        return zone.some((cell) => {
            if (!isBoardCell(this.board, cell)) return false;
            if (!this.isAttackCellInRange(attacker.position, attack, cell)) return false;
            if (this.isOpponentStartingPosition(cell)) {
                return !attack.targetsAlliesOnly && this.canAttackBase(attacker);
            }
            const target = this.getLivingMonsterAt(cell);
            if (!target || target.id === attacker.id) return false;
            if (!canTargetMonsterOwner(attack, target.owner, this.currentPlayer)) return false;
            if (attack.healAmount !== undefined && target.currentHp >= target.monster.hp) {
                return false;
            }
            if (
                attack.cooldownReduction !== undefined &&
                !target.attackCooldowns.some((cooldown) => cooldown > 0)
            ) {
                return false;
            }
            return canAttackMonster(attacker.monster, attack, target.monster);
        });
    }

    protected canAttackBase(attacker: PlacedMonster): boolean {
        return canAttackBaseThisTurn(attacker.summonedOnTurn, this.turnNumber);
    }

    protected isOpponentStartingPosition(position: Position): boolean {
        const opponent: 1 | 2 = this.currentPlayer === 1 ? 2 : 1;
        const startingPosition = this.startingPositions[opponent];
        return position.x === startingPosition.x && position.y === startingPosition.y;
    }

    protected isAttackCellInRange(
        attackerPosition: Position,
        attack: Monster["attacks"][number],
        cell: Position,
    ): boolean {
        return (
            attack.pattern.type !== "jumpArea" ||
            getGridDistance(attackerPosition, cell) <= attack.pattern.range
        );
    }

    protected getAttackZoneForTarget(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        target: Position,
    ): { target: Position; cells: Position[] } | undefined {
        return getAttackZoneOptions(attacker.position, attacker.facing, attack.pattern).find(
            (option) =>
                option.target.x === target.x &&
                option.target.y === target.y &&
                this.isAttackZoneUsable(attacker, attack, option.cells) &&
                this.canSeeAttackTarget(attacker, attack, option.target),
        );
    }

    protected canSeeAttackTarget(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        target: Position,
    ): boolean {
        if (
            attack.hitsAllies ||
            attack.movesToZone ||
            attack.pattern.type === "directionalArea" ||
            attack.pattern.type === "selfRadius"
        ) {
            return true;
        }

        const blockingCells = [
            ...this.obstacles
                .filter((obstacle) => obstacle.height === 1)
                .map(({ position }) => position),
            ...this.placedMonsters
                .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
                .map(({ position }) => position),
        ];
        return hasLineOfSight(attacker.position, target, blockingCells);
    }

    protected getSlimeLanding(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        zone: readonly Position[],
    ): Position | undefined {
        if (attack.pattern.type !== "jumpArea") return undefined;
        const deployedCells = this.placedMonsters.flatMap((placed) => placed.cells);
        const occupiedCells = this.placedMonsters
            .filter((placed) => placed.currentHp > 0 && placed.id !== attacker.id)
            .map((placed) => placed.position);
        const startingCells = Object.values(this.startingPositions);
        return zone
            .filter((cell) => {
                const isDeployed = deployedCells.some(
                    (deployed) => deployed.x === cell.x && deployed.y === cell.y,
                );
                const isOccupied = occupiedCells.some(
                    (occupied) => occupied.x === cell.x && occupied.y === cell.y,
                );
                const isStartingCell = startingCells.some(
                    (starting) => starting.x === cell.x && starting.y === cell.y,
                );
                return isDeployed && !isOccupied && !isStartingCell;
            })
            .sort(
                (first, second) =>
                    getGridDistance(attacker.position, first) -
                    getGridDistance(attacker.position, second),
            )[0];
    }

    protected abstract canAffordMovement(monster: PlacedMonster): boolean;
    protected abstract hasAffordableMovement(): boolean;
}
