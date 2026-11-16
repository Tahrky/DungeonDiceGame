import { GameSceneInitialization } from "./GameSceneInitialization";
import { isRemoteGameCommand } from "./GameSceneProtocol";
import Phaser from "phaser";
import type { GameHudActions } from "./game/GameHud";
import type { BoardHeightChange } from "../types/GameTypes";

export class GameScene extends GameSceneInitialization {

    protected bindInput(): void {
        const handleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
        window.addEventListener("keydown", handleKeyDown, true);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        });

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            const worldPosition = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            this.updatePlacementPreviewLock(worldPosition);
            this.hoveredCell = this.boardView.worldToGrid(worldPosition);
            this.monsterTooltip.update(
                pointer,
                this.placedMonsters,
                this.hoveredInvocationMonster,
                this.currentPlayer,
                !this.selectedMonster && !this.pendingCells,
            );
            this.drawBoard();
        });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.winner !== null) return;

            const worldPosition = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const cell = this.boardView.worldToGrid(worldPosition);
            if (!this.boardView.isInsideBoard(cell)) return;
            this.runLocalCommand({ type: "boardClick", position: cell }, () =>
                this.tryPlaceMonster(cell),
            );
        });
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.repeat || !this.assetsReady) return;

        switch (event.code) {
            case "Escape":
                this.cancelCurrentAction();
                break;
            case "KeyQ":
                if (!this.hasRolled) {
                    this.hudActions.rollDice();
                } else if (this.actionMode.type === "idle" && !this.pendingCells) {
                    this.hudActions.toggleInvocationMenu();
                }
                break;
            case "KeyW":
                if (this.actionMode.type === "attack") {
                    this.hudActions.cancelBoardAction();
                } else if (
                    this.actionMode.type === "idle" &&
                    !this.pendingCells &&
                    !this.invocationMenuOpen
                ) {
                    this.hudActions.startAttack();
                }
                break;
            case "KeyE":
                if (this.actionMode.type === "movement") {
                    this.hudActions.cancelBoardAction();
                } else if (
                    this.actionMode.type === "idle" &&
                    !this.pendingCells &&
                    !this.invocationMenuOpen
                ) {
                    this.hudActions.startMovement();
                }
                break;
            case "KeyP":
                if (this.gameConfiguration.testBoard) {
                    this.runLocalCommand({ type: "debugAddSymbols" }, () => this.addDebugSymbols());
                }
                break;
            case "KeyL":
                this.changeCellHeightAtHoveredCell(1);
                break;
            case "Semicolon":
                this.changeCellHeightAtHoveredCell(-1);
                break;
            case "KeyR":
                if (this.invocationMenuOpen || this.selectedMonster || this.pendingCells) {
                    this.togglePlacementPreviewLock();
                } else {
                    this.hudActions.finishTurn();
                }
                break;
        }
    }

    private changeCellHeightAtHoveredCell(delta: BoardHeightChange): void {
        if (!this.hoveredCell) return;
        const position = { ...this.hoveredCell };
        this.runLocalCommand({ type: "changeCellHeight", delta, position }, () =>
            this.changeCellHeight(delta, position),
        );
    }

    private cancelCurrentAction(): void {
        if (
            this.actionMode.type === "attack" ||
            this.actionMode.type === "movement" ||
            this.actionMode.type === "convertSymbols"
        ) {
            this.hudActions.cancelBoardAction();
        } else if (this.selectedMonster || this.pendingCells) {
            this.hudActions.cancelInvocation();
        } else if (this.invocationMenuOpen) {
            this.hudActions.toggleInvocationMenu();
        }
    }

    private togglePlacementPreviewLock(): void {
        if (this.lockedPreviewCell) {
            this.lockedPreviewCell = null;
            this.hasLeftLockedPreviewBoard = false;
            this.render();
            return;
        }

        const pointer = this.input.activePointer;
        const worldPosition = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (
            !this.selectedMonster ||
            !this.hasRolled ||
            this.pendingCells ||
            this.winner !== null ||
            (this.mode === "online" && this.currentPlayer !== this.localPlayer) ||
            !this.boardView.isPointerOverBoard(worldPosition)
        ) {
            return;
        }

        this.lockedPreviewCell = this.boardView.worldToGrid(worldPosition);
        this.hasLeftLockedPreviewBoard = false;
        this.render();
    }

    private updatePlacementPreviewLock(worldPosition: Phaser.Math.Vector2): void {
        if (!this.lockedPreviewCell) return;

        if (!this.boardView.isPointerOverBoard(worldPosition)) {
            this.hasLeftLockedPreviewBoard = true;
        } else if (this.hasLeftLockedPreviewBoard) {
            this.lockedPreviewCell = null;
            this.hasLeftLockedPreviewBoard = false;
        }
    }

    protected get hudActions(): GameHudActions {
        return {
            rollDice: () => this.runLocalCommand({ type: "rollDice" }, () => this.rollDice()),
            selectMonster: (monsterId) =>
                this.runLocalCommand({ type: "selectMonster", monsterId }, () =>
                    this.selectMonster(monsterId),
                ),
            selectPattern: (index) =>
                this.runLocalCommand({ type: "selectPattern", index }, () =>
                    this.selectPattern(index),
                ),
            rotatePattern: () =>
                this.runLocalCommand({ type: "rotatePattern" }, () => this.rotatePattern()),
            mirrorPattern: () =>
                this.runLocalCommand({ type: "mirrorPattern" }, () => this.mirrorPattern()),
            togglePatternSelector: () =>
                this.runLocalCommand({ type: "togglePatternSelector" }, () =>
                    this.togglePatternSelector(),
                ),
            toggleInvocationMenu: () =>
                this.runLocalCommand({ type: "toggleInvocationMenu" }, () =>
                    this.toggleInvocationMenu(),
                ),
            hoverInvocationMonster: (monster, pointer) => {
                this.hoveredInvocationMonster = monster;
                this.monsterTooltip.update(
                    pointer,
                    this.placedMonsters,
                    monster,
                    this.currentPlayer,
                    !this.selectedMonster && !this.pendingCells,
                );
            },
            storeDie: (dieIndex) =>
                this.runLocalCommand({ type: "storeDie", dieIndex }, () => this.storeDie(dieIndex)),
            selectReserveSymbol: (symbol) =>
                this.runLocalCommand({ type: "selectReserveSymbol", symbol }, () =>
                    this.selectReserveSymbol(symbol),
                ),
            chooseReserveConversionTarget: (targetSymbol) =>
                this.runLocalCommand({ type: "convertReserveSymbols", targetSymbol }, () =>
                    this.chooseReserveConversionTarget(targetSymbol),
                ),
            startAttack: () =>
                this.runLocalCommand({ type: "startAttack" }, () => this.startAttack()),
            selectAttack: (attackIndex) =>
                this.runLocalCommand({ type: "selectAttack", attackIndex }, () =>
                    this.selectAttack(attackIndex),
                ),
            startMovement: () =>
                this.runLocalCommand({ type: "startMovement" }, () => this.startMovement()),
            cancelBoardAction: () =>
                this.runLocalCommand({ type: "cancelBoardAction" }, () => this.cancelBoardAction()),
            cancelInvocation: () =>
                this.runLocalCommand({ type: "cancelInvocation" }, () => this.cancelInvocation()),
            finishTurn: () => this.runLocalCommand({ type: "finishTurn" }, () => this.finishTurn()),
            leaveGame: () => this.game.events.emit("leave-game"),
            scrollActionHistory: (offset) => this.scrollActionHistory(offset),
        };
    }

    protected handleRemoteCommand(value: unknown): void {
        if (
            !this.assetsReady ||
            !this.isHost ||
            this.mode !== "online" ||
            this.currentPlayer !== 2 ||
            !isRemoteGameCommand(value)
        ) {
            return;
        }

        switch (value.type) {
            case "rollDice":
                this.rollDice();
                break;
            case "selectMonster":
                this.selectMonster(value.monsterId);
                break;
            case "selectPattern":
                this.selectPattern(value.index);
                break;
            case "rotatePattern":
                this.rotatePattern();
                break;
            case "mirrorPattern":
                this.mirrorPattern();
                break;
            case "togglePatternSelector":
                this.togglePatternSelector();
                break;
            case "toggleInvocationMenu":
                this.toggleInvocationMenu();
                break;
            case "cancelInvocation":
                this.cancelInvocation();
                break;
            case "storeDie":
                this.storeDie(value.dieIndex);
                break;
            case "selectReserveSymbol":
                this.selectReserveSymbol(value.symbol);
                break;
            case "convertReserveSymbols":
                this.chooseReserveConversionTarget(value.targetSymbol);
                break;
            case "startAttack":
                this.startAttack();
                break;
            case "selectAttack":
                this.selectAttack(value.attackIndex);
                break;
            case "startMovement":
                this.startMovement();
                break;
            case "cancelBoardAction":
                this.cancelBoardAction();
                break;
            case "finishTurn":
                this.finishTurn();
                break;
            case "debugAddSymbols":
                this.addDebugSymbols();
                break;
            case "changeCellHeight":
                this.changeCellHeight(value.delta, value.position);
                break;
            case "boardClick":
                this.tryPlaceMonster(value.position);
                break;
        }
    }

    protected drawBoard(): void {
        this.boardView.draw(this.viewState, {
            canPlace: (origin) => this.canPlaceMonster(origin),
            canMove: (monsterId, destination) => {
                const monster = this.getLivingMonster(monsterId);
                return monster !== undefined && this.canMoveTo(monster, destination);
            },
            getMovementCandidates: (monsterId) => this.getMovementCandidates(monsterId),
            canAttack: (attackerId, attackIndex, targetPosition) =>
                attackIndex !== null &&
                this.canAttackTarget(attackerId, attackIndex, targetPosition),
            getAttackCandidates: (attackerId, attackIndex) =>
                this.getAttackCandidateCells(attackerId, attackIndex),
            getAttackRange: (attackerId, attackIndex) =>
                this.getAttackRangeCells(attackerId, attackIndex),
            getAttackPreview: (attackerId, attackIndex, targetPosition) =>
                this.getAttackPreviewCells(attackerId, attackIndex, targetPosition),
        });
    }
}
