import { GameSceneInitialization } from "./GameSceneInitialization";
import { isRemoteGameCommand } from "./GameSceneProtocol";
import Phaser from "phaser";
import type { GameHudActions } from "./game/GameHud";
import type { BoardHeightChange, Monster, RemoteGameCommand } from "../types/GameTypes";

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
            this.updateTooltip(pointer, this.hoveredInvocationMonster);
            this.drawBoard();
        });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.winner !== null) return;

            const worldPosition = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const cell = this.boardView.worldToGrid(worldPosition);
            if (!this.boardView.isInsideBoard(cell)) return;
            this.dispatch({ type: "boardClick", position: cell });
        });
    }

    private updateTooltip(pointer: Phaser.Input.Pointer, invocationMonster: Monster | null): void {
        this.monsterTooltip.update(
            pointer,
            this.placedMonsters,
            invocationMonster,
            this.currentPlayer,
            !this.selectedMonster && !this.pendingCells,
        );
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
                this.toggleBoardAction("attack", () => this.hudActions.startAttack());
                break;
            case "KeyE":
                this.toggleBoardAction("movement", () => this.hudActions.startMovement());
                break;
            case "KeyP":
                if (this.gameConfiguration.testBoard) this.dispatch({ type: "debugAddSymbols" });
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

    private toggleBoardAction(type: "attack" | "movement", start: () => void): void {
        if (this.actionMode.type === type) {
            this.hudActions.cancelBoardAction();
        } else if (
            this.actionMode.type === "idle" &&
            !this.pendingCells &&
            !this.invocationMenuOpen
        ) {
            start();
        }
    }

    private changeCellHeightAtHoveredCell(delta: BoardHeightChange): void {
        if (!this.hoveredCell) return;
        this.dispatch({ type: "changeCellHeight", delta, position: { ...this.hoveredCell } });
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

    private dispatch(command: RemoteGameCommand): void {
        this.runLocalCommand(command, () => this.executeCommand(command));
    }

    protected get hudActions(): GameHudActions {
        return {
            rollDice: () => this.dispatch({ type: "rollDice" }),
            selectMonster: (monsterId) => this.dispatch({ type: "selectMonster", monsterId }),
            selectPattern: (index) => this.dispatch({ type: "selectPattern", index }),
            rotatePattern: () => this.dispatch({ type: "rotatePattern" }),
            mirrorPattern: () => this.dispatch({ type: "mirrorPattern" }),
            togglePatternSelector: () => this.dispatch({ type: "togglePatternSelector" }),
            toggleInvocationMenu: () => this.dispatch({ type: "toggleInvocationMenu" }),
            hoverInvocationMonster: (monster, pointer) => {
                this.hoveredInvocationMonster = monster;
                this.updateTooltip(pointer, monster);
            },
            storeDie: (dieIndex) => this.dispatch({ type: "storeDie", dieIndex }),
            selectReserveSymbol: (symbol) => this.dispatch({ type: "selectReserveSymbol", symbol }),
            chooseReserveConversionTarget: (targetSymbol) =>
                this.dispatch({ type: "convertReserveSymbols", targetSymbol }),
            startAttack: () => this.dispatch({ type: "startAttack" }),
            selectAttack: (attackIndex) => this.dispatch({ type: "selectAttack", attackIndex }),
            startMovement: () => this.dispatch({ type: "startMovement" }),
            cancelBoardAction: () => this.dispatch({ type: "cancelBoardAction" }),
            cancelInvocation: () => this.dispatch({ type: "cancelInvocation" }),
            finishTurn: () => this.dispatch({ type: "finishTurn" }),
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

        this.executeCommand(value);
    }

    private executeCommand(command: RemoteGameCommand): void {
        switch (command.type) {
            case "rollDice":
                this.rollDice();
                break;
            case "selectMonster":
                this.selectMonster(command.monsterId);
                break;
            case "selectPattern":
                this.selectPattern(command.index);
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
                this.storeDie(command.dieIndex);
                break;
            case "selectReserveSymbol":
                this.selectReserveSymbol(command.symbol);
                break;
            case "convertReserveSymbols":
                this.chooseReserveConversionTarget(command.targetSymbol);
                break;
            case "startAttack":
                this.startAttack();
                break;
            case "selectAttack":
                this.selectAttack(command.attackIndex);
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
                this.changeCellHeight(command.delta, command.position);
                break;
            case "boardClick":
                this.tryPlaceMonster(command.position);
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
