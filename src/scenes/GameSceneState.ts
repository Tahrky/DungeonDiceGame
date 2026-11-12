import Phaser from "phaser";
import { isGameSnapshot } from "./GameSceneProtocol";
import { GAME_CONFIG } from "../config";
import { MONSTERS } from "../data/monsters";
import { createEmptyDiceReserve, spendSymbols } from "../game/diceResources";
import {
    canUseActionThisTurn,
    getAttackActionsPerTurn,
    getMovementActionsPerTurn,
} from "../game/monsterActions";
import { getDefaultDeck, parseDeck, type GameSetup } from "../game/decks";
import { BoardView } from "./game/BoardView";
import { GameHud } from "./game/GameHud";
import { MonsterTooltip } from "./game/MonsterTooltip";
import { MonsterSpriteView } from "./game/MonsterSpriteView";
import {
    getBoardOrigin,
    getDefaultBoard,
    getStartingPositions,
    parseBoardDefinition,
    resolveBoardSelection,
    type BoardDefinition,
} from "../game/boards";
import type { GameHudActions } from "./game/GameHud";
import type { GameViewState } from "./game/GameViewState";
import type { BoardActionMode, DiceReserve, DiceSymbol, GameActionLogEntry, Monster, PlayerId, PlacedMonster, Position, RolledDie, GameSnapshot, RemoteGameCommand } from "../types/GameTypes";

export abstract class GameSceneState extends Phaser.Scene {
    protected boardGraphics!: Phaser.GameObjects.Graphics;

    protected uiContainer!: Phaser.GameObjects.Container;

    protected tooltipContainer!: Phaser.GameObjects.Container;

    protected boardView!: BoardView;

    protected gameHud!: GameHud;

    protected monsterTooltip!: MonsterTooltip;

    protected monsterSpriteView!: MonsterSpriteView;

    protected currentPlayer: PlayerId = 1;

    protected turnNumber = 1;

    protected playerHealth: Record<PlayerId, number> = { 1: 3, 2: 3 };

    protected playerDecks: Record<PlayerId, string[]> = {
        1: getDefaultDeck(),
        2: getDefaultDeck(),
    };

    protected computerOpponent = false;

    protected mode: GameSetup["mode"] = "computer";

    protected localPlayer: PlayerId = 1;

    protected isHost = true;

    protected computerTurnInProgress = false;

    protected winner: PlayerId | null = null;

    protected hasRolled = false;

    protected rolledDice: RolledDie[] = [];

    protected diceReserves: Record<PlayerId, DiceReserve> = {
        1: createEmptyDiceReserve(),
        2: createEmptyDiceReserve(),
    };

    protected actionMode: BoardActionMode = { type: "idle" };

    protected selectedMonster: Monster | null = null;

    protected selectedPattern = 0;

    protected patternRotation = 0;

    protected patternMirrored = false;

    protected patternSelectorExpanded = true;

    protected invocationMenuOpen = false;

    protected pendingCells: Position[] | null = null;

    protected placedMonsters: PlacedMonster[] = [];

    protected actionHistory: GameActionLogEntry[] = [];

    protected actionHistoryScrollOffset = 0;

    protected hoveredCell: Position | null = null;

    protected hoveredInvocationMonster: Monster | null = null;

    protected nextMonsterId = 1;

    protected board = getDefaultBoard();

    protected startingPositions = getStartingPositions(this.board);

    constructor() {
        super("GameScene");
    }

    preload(): void {
        MonsterSpriteView.preload(this);
    }

    init(data?: Partial<GameSetup>): void {
        let board: BoardDefinition;
        if (data?.board !== undefined) {
            const parsedBoard = parseBoardDefinition(data.board);
            if (!parsedBoard) throw new Error("La définition du plateau est invalide.");
            board = parsedBoard;
        } else if (data?.boardSelection) {
            board = resolveBoardSelection(data.boardSelection);
        } else {
            board = getDefaultBoard();
        }
        this.board = board;
        this.startingPositions = getStartingPositions(this.board);
        this.currentPlayer = 1;
        this.turnNumber = 1;
        this.playerHealth = { 1: 3, 2: 3 };
        this.playerDecks = {
            1: parseDeck(data?.playerDeck) ?? getDefaultDeck(),
            2: parseDeck(data?.opponentDeck) ?? getDefaultDeck(),
        };
        this.mode = data?.mode ?? "computer";
        this.computerOpponent = data?.mode === "computer";
        this.localPlayer = data?.localPlayer ?? 1;
        this.isHost = data?.isHost ?? true;
        this.computerTurnInProgress = false;
        this.winner = null;
        this.hasRolled = false;
        this.rolledDice = [];
        this.diceReserves = {
            1: createEmptyDiceReserve(),
            2: createEmptyDiceReserve(),
        };
        this.actionMode = { type: "idle" };
        this.selectedMonster = null;
        this.selectedPattern = 0;
        this.patternRotation = 0;
        this.patternMirrored = false;
        this.patternSelectorExpanded = true;
        this.invocationMenuOpen = false;
        this.pendingCells = null;
        this.placedMonsters = [];
        this.actionHistory = [];
        this.actionHistoryScrollOffset = 0;
        this.hoveredCell = null;
        this.hoveredInvocationMonster = null;
        this.nextMonsterId = 1;
    }

    protected gridToScreen(position: Position): Position {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        const origin = getBoardOrigin(this.board);
        return {
            x: origin.x + ((position.x - position.y) * tileWidth) / 2,
            y: origin.y + ((position.x + position.y) * tileHeight) / 2,
        };
    }

    protected get viewState(): GameViewState {
        return {
            currentPlayer: this.currentPlayer,
            turnNumber: this.turnNumber,
            playerHealth: this.playerHealth,
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
            placedMonsters: this.placedMonsters,
            actionHistory: this.actionHistory,
            actionHistoryScrollOffset: this.actionHistoryScrollOffset,
            hoveredCell: this.hoveredCell,
            startingPositions: this.startingPositions,
            boardOrigin: getBoardOrigin(this.board),
        };
    }

    protected render(): void {
        this.drawBoard();
        this.monsterSpriteView.render(this.placedMonsters, this.getGrayscaleMonsterIds());
        this.gameHud.render(this.viewState, this.hudActions);
        if (this.mode === "online" && this.isHost) {
            this.game.events.emit("remote-game-state-out", this.createSnapshot());
        }
    }

    protected getGrayscaleMonsterIds(): ReadonlySet<string> {
        const grayscaled = new Set<string>();
        for (const monster of this.placedMonsters) {
            if (monster.currentHp <= 0) continue;

            if (this.winner !== null) {
                grayscaled.add(monster.id);
            } else if (
                monster.owner === this.currentPlayer &&
                ((this.actionMode.type === "attack" &&
                    !canUseActionThisTurn(
                        monster.attacksUsedThisTurn,
                        getAttackActionsPerTurn(monster.monster),
                    )) ||
                    (this.actionMode.type === "movement" &&
                        !canUseActionThisTurn(
                            monster.movementsUsedThisTurn,
                            getMovementActionsPerTurn(monster.monster),
                        )))
            ) {
                grayscaled.add(monster.id);
            }
        }
        return grayscaled;
    }

    protected runLocalCommand(command: RemoteGameCommand, action: () => void): void {
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
            actionHistory: this.actionHistory,
            actionHistoryScrollOffset: this.actionHistoryScrollOffset,
            nextMonsterId: this.nextMonsterId,
        };
    }

    protected applyRemoteSnapshot(value: unknown): void {
        if (this.isHost || this.mode !== "online" || !isGameSnapshot(value)) return;

        this.currentPlayer = value.currentPlayer;
        this.turnNumber = value.turnNumber;
        this.playerHealth = value.playerHealth;
        this.winner = value.winner;
        this.hasRolled = value.hasRolled;
        this.rolledDice = value.rolledDice;
        this.diceReserves = value.diceReserves;
        this.actionMode = value.actionMode;
        this.selectedMonster =
            value.selectedMonsterId === null
                ? null
                : (MONSTERS.find((monster) => monster.id === value.selectedMonsterId) ?? null);
        this.selectedPattern = value.selectedPattern;
        this.patternRotation = value.patternRotation;
        this.patternMirrored = value.patternMirrored;
        this.patternSelectorExpanded = value.patternSelectorExpanded;
        this.invocationMenuOpen = value.invocationMenuOpen;
        this.pendingCells = value.pendingCells;
        this.placedMonsters = value.placedMonsters;
        this.actionHistory = value.actionHistory;
        this.actionHistoryScrollOffset = value.actionHistoryScrollOffset;
        this.nextMonsterId = value.nextMonsterId;
        this.render();
    }

    protected getDeckMonsters(player: PlayerId): Monster[] {
        return this.playerDecks[player]
            .map((id) => MONSTERS.find((monster) => monster.id === id))
            .filter((monster): monster is Monster => monster !== undefined);
    }

    protected recordAction(entry: GameActionLogEntry): void {
        this.actionHistory = [...this.actionHistory, entry];
        this.actionHistoryScrollOffset = 0;
    }

    protected getLivingMonsterAt(position: Position): PlacedMonster | undefined {
        return this.placedMonsters.find(
            (placed) =>
                placed.currentHp > 0 &&
                placed.position.x === position.x &&
                placed.position.y === position.y,
        );
    }

    protected getLivingMonster(id: string): PlacedMonster | undefined {
        return this.placedMonsters.find((placed) => placed.id === id && placed.currentHp > 0);
    }

    protected spendCurrentSymbol(symbol: DiceSymbol, amount = 1): boolean {
        return spendSymbols(symbol, amount, this.rolledDice, this.diceReserves[this.currentPlayer]);
    }

    protected abstract drawBoard(): void;
    protected abstract get hudActions(): GameHudActions;
}
