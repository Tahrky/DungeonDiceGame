import { GameSceneInvocation } from "./GameSceneInvocation";
import { isBoardCell } from "../game/boards";
import { getAvailableSymbolCount } from "../game/diceResources";
import { canAttackMonster, canUseActionThisTurn, getAttackActionsPerTurn, getAttackZoneOptions, getFacingFromMovement, getGridDistance, getMovementActionsPerTurn, getMovementCost, isBehind } from "../game/monsterActions";
import type { DiceSymbol, Monster, PlayerId, PlacedMonster, Position } from "../types/GameTypes";
import { getMonsterEliminationWinner } from "../game/matchRules";

export abstract class GameSceneCombat extends GameSceneInvocation {
    protected startAttack(): void {
        if (!this.canStartSymbolAction("attack")) return;
        this.selectedMonster = null;
        this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        this.render();
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
                getMovementCost(monster.monster) <= movementCount,
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
            affordableAttacks.reduce((total, { attack }) => total + attack.cost, 0);
        let defaultAttack: (typeof affordableAttacks)[number] | undefined;
        if (affordableAttacks.length === 1) {
            defaultAttack = affordableAttacks[0];
        } else if (cannotAffordSeveralAttacks) {
            defaultAttack = affordableAttacks.reduce<
                (typeof affordableAttacks)[number] | undefined
            >((cheapest, candidate) => {
                if (!cheapest || candidate.attack.cost < cheapest.attack.cost) return candidate;
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
        return !selectedAttack?.hitsAllies;
    }

    protected getSelectedAttackIndex(): number | null {
        return this.actionMode.type === "attack" ? this.actionMode.attackIndex : null;
    }

    protected executeAttack(
        attacker: PlacedMonster,
        attackIndex: number,
        targetPosition: Position,
        clickedMonster: PlacedMonster | undefined,
    ): void {
        if (!this.canAttackTarget(attacker.id, attackIndex, targetPosition)) return;
        const attack = attacker.monster.attacks[attackIndex];
        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition);
        if (!zone || !this.spendCurrentSymbol("attack", attack.cost)) return;
        attacker.attacksUsedThisTurn++;
        if (attack.cooldownTurns !== undefined) {
            attacker.attackCooldowns[attackIndex] = attack.cooldownTurns;
        }
        const isBackstab =
            clickedMonster !== undefined &&
            clickedMonster.owner !== this.currentPlayer &&
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(clickedMonster.position, attacker.position, clickedMonster.facing);
        this.monsterSpriteView.playAttack(attacker.id, attackIndex, isBackstab);

        if (
            attack.hitsAllies ||
            attack.movesToZone ||
            attack.pattern.type === "directionalArea" ||
            attack.pattern.type === "selfRadius"
        ) {
            this.executeAreaAttack(attacker, attack, zone.cells);
            return;
        }

        this.executeSingleTargetAttack(
            attacker,
            attack,
            targetPosition,
            clickedMonster,
            isBackstab,
        );
    }

    protected executeAreaAttack(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        zone: readonly Position[],
    ): void {
        const attackOrigin = { ...attacker.position };
        let hitSomething = false;
        if (attack.movesToZone) {
            const landing = this.getSlimeLanding(attacker, attack, zone);
            if (landing) {
                const previousPosition = attacker.position;
                attacker.position = { ...landing };
                attacker.facing = getFacingFromMovement(previousPosition, landing, attacker.facing);
            }
        }

        for (const monster of this.placedMonsters) {
            const isInZone = zone.some(
                (cell) =>
                    cell.x === monster.position.x &&
                    cell.y === monster.position.y &&
                    this.isAttackCellInRange(attackOrigin, attack, cell),
            );
            if (
                monster.currentHp > 0 &&
                monster.id !== attacker.id &&
                isInZone &&
                (attack.hitsAllies || monster.owner !== this.currentPlayer) &&
                canAttackMonster(attacker.monster, attack, monster.monster)
            ) {
                monster.currentHp -= attack.damage;
                this.monsterSpriteView.takeDamage(monster.id, monster.currentHp, monster.position);
                this.recordAttack(
                    attacker,
                    `${monster.monster.name} (J${monster.owner})`,
                    attack.damage,
                );
                hitSomething = true;
            }
        }
        if (this.isOpponentStartInAttackZone(zone, attackOrigin, attack)) {
            this.damageOpponentPlayer();
            const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
            this.recordAttack(attacker, `J${opponent} (départ)`, 1);
            hitSomething = true;
        }
        if (!hitSomething) {
            this.recordAttack(attacker, "zone ciblée", 0);
        }
        this.finishAttack();
    }

    protected executeSingleTargetAttack(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        targetPosition: Position,
        target: PlacedMonster | undefined,
        isBackstab: boolean,
    ): void {
        if (!target) {
            if (this.isOpponentStartingPosition(targetPosition)) {
                this.damageOpponentPlayer();
                const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
                this.recordAttack(attacker, `J${opponent} (départ)`, 1);
            } else {
                this.recordAttack(attacker, "case vide", 0);
            }
            this.finishAttack();
            return;
        }
        if (target.owner === this.currentPlayer) return;
        const backstabBonus = attacker.monster.bonusDamageFromBehind ?? 0;
        const damage = attack.damage + (isBackstab ? backstabBonus : 0);
        target.currentHp -= damage;
        this.monsterSpriteView.takeDamage(target.id, target.currentHp, target.position);
        this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, damage);
        this.finishAttack();
    }

    protected recordAttack(attacker: PlacedMonster, targetName: string, damage: number): void {
        this.recordAction({
            type: "attack",
            player: this.currentPlayer,
            attackerName: attacker.monster.name,
            targetName,
            damage,
        });
    }

    protected finishAttack(): void {
        this.winner ??= getMonsterEliminationWinner(
            this.placedMonsters,
            this.gameConfiguration.maxMonstersPerPlayer,
        );
        const remainingAttacks = getAvailableSymbolCount(
            "attack",
            this.rolledDice,
            this.diceReserves[this.currentPlayer],
        );
        if (this.winner !== null || remainingAttacks === 0) {
            this.actionMode = { type: "idle" };
        } else if (this.actionMode.type === "attack") {
            this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        }
        this.render();
    }

    protected damageOpponentPlayer(): void {
        const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
        this.playerHealth[opponent]--;
        if (this.playerHealth[opponent] === 0) this.winner = this.currentPlayer;
    }

    protected isOpponentStartingPosition(position: Position): boolean {
        const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
        const startingPosition = this.startingPositions[opponent];
        return position.x === startingPosition.x && position.y === startingPosition.y;
    }

    protected isOpponentStartInAttackZone(
        zone: readonly Position[],
        attackOrigin: Position,
        attack: Monster["attacks"][number],
    ): boolean {
        return zone.some(
            (cell) =>
                this.isOpponentStartingPosition(cell) &&
                this.isAttackCellInRange(attackOrigin, attack, cell),
        );
    }

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
        if (
            !attacker ||
            !attack ||
            !this.canUseMonsterAttack(attacker, attackIndex)
        ) {
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
        ).filter((option) => this.isAttackZoneUsable(attacker, attack, option.cells));
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
                    isBoardCell(this.board, cell),
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
        return zone.filter((cell) => this.isAttackCellInRange(attacker.position, attack, cell));
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
            if (this.isOpponentStartingPosition(cell)) return true;
            const target = this.getLivingMonsterAt(cell);
            if (!target || target.id === attacker.id) return false;
            if (!attack.hitsAllies && target.owner === this.currentPlayer) return false;
            return canAttackMonster(attacker.monster, attack, target.monster);
        });
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
                this.isAttackZoneUsable(attacker, attack, option.cells),
        );
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
