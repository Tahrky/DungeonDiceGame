import { GameSceneData } from "./GameSceneData";
import { isGameSnapshot } from "./GameSceneProtocol";
import { addSymbolsToReserve, convertReservedSymbols } from "../game/diceResources";
import {
    canUseActionThisTurn,
    getAttackActionsPerTurn,
    getMovementActionsPerTurn,
} from "../game/monsterActions";
import { getBoardOrigin } from "../game/boards";
import type { GameHudActions } from "./game/GameHud";
import type { GameViewState } from "./game/GameViewState";
import type {
    DiceSymbol,
    GameSnapshot,
    PlacedMonster,
    RemoteGameCommand,
} from "../types/GameTypes";

export abstract class GameSceneState extends GameSceneData {
    protected get viewState(): GameViewState {
        return {
            currentPlayer: this.currentPlayer,
            turnNumber: this.turnNumber,
            playerHealth: this.playerHealth,
            playerMaxHealth: this.gameConfiguration.initialPlayerHealth,
            maxMonstersPerPlayer: this.gameConfiguration.maxMonstersPerPlayer,
            monstersKilledForVictory: this.gameConfiguration.monstersKilledForVictory,
            availableMonsters: this.getDeckMonsters(this.currentPlayer),
            computerOpponent: this.computerOpponent,
            onlineGame: this.mode === "online",
            isLocalTurn: this.currentPlayer === this.localPlayer,
            winner: this.winner,
            hasRolled: this.hasRolled,
            rolledDice: this.rolledDice,
            diceReserves: this.diceReserves,
            actionMode: this.actionMode,
            selectedMonster: this.selectedMonster,
            selectedPattern: this.selectedPattern,
            patternRotation: this.patternRotation,
            patternMirrored: this.patternMirrored,
            patternSelectorExpanded: this.patternSelectorExpanded,
            invocationMenuOpen: this.invocationMenuOpen,
            pendingCells: this.pendingCells,
            lockedPreviewCell: this.lockedPreviewCell,
            placedMonsters: this.placedMonsters,
            obstacles: this.obstacles,
            actionHistory: this.actionHistory,
            actionHistoryScrollOffset: this.actionHistoryScrollOffset,
            hoveredCell: this.hoveredCell,
            startingPositions: this.startingPositions,
            boardOrigin: getBoardOrigin(this.board),
        };
    }

    protected render(): void {
        this.drawBoard();
        this.monsterSpriteView.render(
            this.placedMonsters,
            this.getGrayscaleMonsterIds(),
            this.getCamouflagedMonsterIds(),
        );
        this.gameHud.render(this.viewState, this.hudActions);
        if (this.assetsReady && !this.computerTurnInProgress) {
            this.game.events.emit("persist-game-snapshot", this.createSnapshot());
        }
        if (this.mode === "online" && this.isHost) {
            this.game.events.emit("remote-game-state-out", this.createSnapshot());
        }
    }

    protected getGrayscaleMonsterIds(): ReadonlySet<string> {
        return this.getMonsterIds(
            (monster) =>
                monster.isCamouflaged ||
                this.winner !== null ||
                this.cannotActInCurrentMode(monster),
        );
    }

    protected getCamouflagedMonsterIds(): ReadonlySet<string> {
        return this.getMonsterIds((monster) => monster.isCamouflaged);
    }

    private getMonsterIds(predicate: (monster: PlacedMonster) => boolean): ReadonlySet<string> {
        return new Set(this.placedMonsters.filter(predicate).map(({ id }) => id));
    }

    private cannotActInCurrentMode(monster: PlacedMonster): boolean {
        if (monster.currentHp <= 0 || monster.owner !== this.currentPlayer) return false;
        switch (this.actionMode.type) {
            case "attack":
                return !canUseActionThisTurn(
                    monster.attacksUsedThisTurn,
                    getAttackActionsPerTurn(monster.monster),
                );
            case "movement":
                return !canUseActionThisTurn(
                    monster.movementsUsedThisTurn,
                    getMovementActionsPerTurn(monster.monster),
                );
            default:
                return false;
        }
    }

    protected runLocalCommand(command: RemoteGameCommand, action: () => void): void {
        if (!this.assetsReady) return;
        if (this.mode !== "online") {
            action();
            return;
        }
        if (this.localPlayer !== this.currentPlayer) return;
        if (this.isHost) {
            action();
        } else {
            this.game.events.emit("remote-game-command-out", command);
        }
    }

    protected addDebugSymbols(): void {
        if (!this.gameConfiguration.testBoard) return;

        addSymbolsToReserve(this.diceReserves[this.currentPlayer], 100);
        this.render();
    }

    protected selectReserveSymbol(symbol: DiceSymbol): void {
        if (
            this.winner !== null ||
            this.pendingCells ||
            this.selectedMonster ||
            this.invocationMenuOpen
        ) {
            return;
        }

        const reserve = this.diceReserves[this.currentPlayer];
        const selectedSymbols =
            this.actionMode.type === "convertSymbols" ? this.actionMode.selectedSymbols : [];
        if (this.actionMode.type !== "idle" && this.actionMode.type !== "convertSymbols") return;
        if (selectedSymbols.length >= 2) return;
        if (
            this.actionMode.type === "idle" &&
            Object.values(reserve).reduce((total, count) => total + count, 0) < 2
        ) {
            return;
        }

        const alreadySelected = selectedSymbols.filter((selected) => selected === symbol).length;
        if (reserve[symbol] <= alreadySelected) return;

        this.actionMode = {
            type: "convertSymbols",
            selectedSymbols: [...selectedSymbols, symbol],
        };
        this.render();
    }

    protected chooseReserveConversionTarget(targetSymbol: DiceSymbol): void {
        if (
            this.actionMode.type !== "convertSymbols" ||
            this.actionMode.selectedSymbols.length !== 2 ||
            this.winner !== null
        ) {
            return;
        }

        if (
            convertReservedSymbols(
                this.diceReserves[this.currentPlayer],
                this.actionMode.selectedSymbols,
                targetSymbol,
            )
        ) {
            this.actionMode = { type: "idle" };
            this.render();
        }
    }

    protected createSnapshot(): GameSnapshot {
        return {
            currentPlayer: this.currentPlayer,
            turnNumber: this.turnNumber,
            playerHealth: this.playerHealth,
            winner: this.winner,
            hasRolled: this.hasRolled,
            rolledDice: this.rolledDice,
            diceReserves: this.diceReserves,
            actionMode: this.actionMode,
            selectedMonsterId: this.selectedMonster?.id ?? null,
            selectedPattern: this.selectedPattern,
            patternRotation: this.patternRotation,
            patternMirrored: this.patternMirrored,
            patternSelectorExpanded: this.patternSelectorExpanded,
            invocationMenuOpen: this.invocationMenuOpen,
            pendingCells: this.pendingCells,
            placedMonsters: this.placedMonsters,
            obstacles: this.obstacles,
            actionHistory: this.actionHistory,
            actionHistoryScrollOffset: this.actionHistoryScrollOffset,
            nextMonsterId: this.nextMonsterId,
        };
    }

    protected applyRemoteSnapshot(value: unknown): void {
        if (this.isHost || this.mode !== "online" || !isGameSnapshot(value)) return;

        if (value.currentPlayer !== this.currentPlayer || value.turnNumber !== this.turnNumber) {
            this.lockedPreviewCell = null;
            this.hasLeftLockedPreviewBoard = false;
        }

        const previousMonsters = new Map(
            this.placedMonsters.map((monster) => [monster.id, monster]),
        );
        for (const monster of value.placedMonsters) {
            const previousMonster = previousMonsters.get(monster.id);
            if (previousMonster && monster.currentHp < previousMonster.currentHp) {
                this.monsterSpriteView.takeDamage(monster.id, monster.currentHp, monster.position);
            }
        }

        this.applySnapshot(value);
        this.render();
    }

    protected applySnapshot(value: GameSnapshot): void {
        this.currentPlayer = value.currentPlayer;
        this.turnNumber = value.turnNumber;
        this.playerHealth = value.playerHealth;
        this.winner = value.winner;
        this.hasRolled = value.hasRolled;
        this.rolledDice = value.rolledDice;
        this.diceReserves = value.diceReserves;
        this.actionMode = value.actionMode;
        this.selectedMonster =
            this.gameConfiguration.monsters.find(({ id }) => id === value.selectedMonsterId) ??
            null;
        this.selectedPattern = value.selectedPattern;
        this.patternRotation = value.patternRotation;
        this.patternMirrored = value.patternMirrored;
        this.patternSelectorExpanded = value.patternSelectorExpanded;
        this.invocationMenuOpen = value.invocationMenuOpen;
        this.pendingCells = value.pendingCells;
        this.placedMonsters = value.placedMonsters.map((monster) => ({
            ...monster,
            statusEffects: monster.statusEffects ?? [],
            isCamouflaged: monster.isCamouflaged === true,
        }));
        this.obstacles = value.obstacles;
        this.actionHistory = value.actionHistory;
        this.actionHistoryScrollOffset = value.actionHistoryScrollOffset;
        this.nextMonsterId = value.nextMonsterId;
    }

    protected abstract drawBoard(): void;
    protected abstract get hudActions(): GameHudActions;
}
