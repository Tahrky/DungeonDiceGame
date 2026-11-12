import { GameSceneMovement } from "./GameSceneMovement";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getAvailableSymbolCount, spendSymbols } from "../game/diceResources";
import { getInitialAttackCooldowns } from "../game/monsterActions";
import { findValidPlacement } from "../game/placement";
import { isBoardCell } from "../game/boards";
import type { PlacedMonster, Position } from "../types/GameTypes";
import { getInvokedMonsterCount } from "../game/matchRules";

export abstract class GameSceneComputer extends GameSceneMovement {
    protected playComputerTurn(): void {
        if (this.currentPlayer !== 2 || this.winner !== null) {
            this.computerTurnInProgress = false;
            return;
        }

        this.rollDice(true);
        this.deployComputerMonsters();
        this.playComputerAttacks();
        this.computerTurnInProgress = false;
        this.finishTurn();
    }

    protected deployComputerMonsters(): void {
        let deployments = 0;
        while (
            deployments < this.playerDecks[2].length &&
            getInvokedMonsterCount(this.placedMonsters, 2) <
                this.gameConfiguration.maxMonstersPerPlayer
        ) {
            deployments++;
            const availableInvocation = getAvailableSymbolCount(
                "invocation",
                this.rolledDice,
                this.diceReserves[2],
            );
            const candidates = this.getDeckMonsters(2)
                .filter((monster) => monster.cost <= availableInvocation)
                .sort((first, second) => second.cost - first.cost);
            let deployed = false;

            for (const monster of candidates) {
                const placement = this.findComputerPlacement();
                if (
                    !placement ||
                    !spendSymbols("invocation", monster.cost, this.rolledDice, this.diceReserves[2])
                ) {
                    continue;
                }

                this.placedMonsters.push({
                    id: `monster-${this.nextMonsterId++}`,
                    monster,
                    owner: 2,
                    position: placement.position,
                    facing: "west",
                    currentHp: monster.hp,
                    cells: placement.cells,
                    attacksUsedThisTurn: 0,
                    movementsUsedThisTurn: 0,
                    attackCooldowns: getInitialAttackCooldowns(monster),
                });
                this.recordAction({
                    type: "invocation",
                    player: 2,
                    monsterName: monster.name,
                    cost: monster.cost,
                });
                deployed = true;
                break;
            }

            if (!deployed) break;
        }
    }

    protected findComputerPlacement(): { position: Position; cells: Position[] } | null {
        const occupiedCells = [
            ...Object.values(this.startingPositions),
            ...this.placedMonsters.flatMap((placed) => placed.cells),
        ];
        const computerPathCells = this.placedMonsters
            .filter((placed) => placed.owner === 2)
            .flatMap((placed) => placed.cells);
        const computerTerritory = [this.startingPositions[2], ...computerPathCells];
        const computerTerritoryKeys = new Set(
            computerTerritory.map((cell) => `${cell.x},${cell.y}`),
        );
        const opponentTerritoryKeys = new Set(
            [
                this.startingPositions[1],
                ...this.placedMonsters
                    .filter((placed) => placed.owner === 1)
                    .flatMap((placed) => placed.cells),
            ].map((cell) => `${cell.x},${cell.y}`),
        );
        const frontierX = Math.min(...computerTerritory.map((cell) => cell.x));

        return findValidPlacement({
            patterns: PLACEMENT_PATTERNS,
            boardWidth: this.board.width,
            boardHeight: this.board.height,
            start: this.startingPositions[2],
            occupiedCells,
            connectedCells: computerTerritory,
            overlappingCells: computerPathCells,
            blockedCells: this.board.blockedCells,
            isPlacementAllowed: (position, cells) => {
                const positionKey = `${position.x},${position.y}`;
                const isStartingCell = opponentTerritoryKeys.has(positionKey);
                const isMonsterOccupied = this.placedMonsters.some(
                    (monster) =>
                        monster.currentHp > 0 &&
                        monster.position.x === position.x &&
                        monster.position.y === position.y,
                );
                const addsTerritory = !computerTerritoryKeys.has(positionKey);
                const staysOnBoard = cells.every((cell) => isBoardCell(this.board, cell));
                const crossesEnemyTerritory = cells.some((cell) =>
                    opponentTerritoryKeys.has(`${cell.x},${cell.y}`),
                );
                return (
                    !isStartingCell &&
                    !isMonsterOccupied &&
                    addsTerritory &&
                    staysOnBoard &&
                    !crossesEnemyTerritory
                );
            },
            scorePlacement: (_position, cells) => {
                const newCells = cells.filter(
                    (cell) => !computerTerritoryKeys.has(`${cell.x},${cell.y}`),
                );
                const furthestProgress = Math.min(...newCells.map((cell) => cell.x));
                const forwardProgress = frontierX - furthestProgress;
                return forwardProgress * 100 + newCells.length;
            },
        });
    }

    protected playComputerAttacks(): void {
        while (this.hasComputerAttackResource()) {
            if (!this.performComputerAttack()) break;
        }
    }

    protected hasComputerAttackResource(): boolean {
        return (
            this.winner === null &&
            getAvailableSymbolCount("attack", this.rolledDice, this.diceReserves[2]) > 0
        );
    }

    protected performComputerAttack(): boolean {
        const attackers = this.placedMonsters.filter(
            (monster) => monster.owner === 2 && monster.currentHp > 0,
        );
        for (const attacker of attackers) {
            if (this.performComputerAttackWith(attacker)) return true;
        }
        return false;
    }

    protected performComputerAttackWith(attacker: PlacedMonster): boolean {
        for (const attackIndex of attacker.monster.attacks.keys()) {
            if (!this.canUseMonsterAttack(attacker, attackIndex)) continue;

            const targetPosition = this.getAttackCandidateCells(attacker.id, attackIndex).find(
                (position) => this.canAttackTarget(attacker.id, attackIndex, position),
            );
            if (!targetPosition) continue;

            this.executeAttack(
                attacker,
                attackIndex,
                targetPosition,
                this.getLivingMonsterAt(targetPosition),
            );
            return true;
        }
        return false;
    }
}
