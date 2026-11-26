import Phaser from "phaser";
import { GAME_CONFIG } from "../data/configuration";
import {
    getAvailableSymbolCount,
    createEmptyDiceReserve,
    spendSymbols,
} from "../game/diceResources";
import {
    getDefaultGameConfiguration,
    parseGameConfiguration,
    type GameConfiguration,
} from "../game/gameConfiguration";
import { createPlacedMonster, getAttackCost, getMovementCost } from "../game/monsterActions";
import { getDefaultDeck, getPlayerDecks, parseDeck, type GameSetup } from "../game/decks";
import { getInvokedMonsterCount } from "../game/matchRules";
import { isSamePosition } from "../game/geometry";
import { createMatchRandomStreams, type MatchRandomStreams } from "../game/random";
import {
    BOT_PROFILES,
    parseBotStrategyWeightMap,
    type BotProfile,
    type BotStrategyWeightMap,
} from "../game/botStrategy";
import { parseBotDecisionOptions, type BotDecisionOptions } from "../game/botConfiguration";
import {
    getBoardOrigin,
    getDefaultBoard,
    getStartingPositions,
    parseBoardDefinition,
    resolveBoardSelection,
    type BoardDefinition,
} from "../game/boards";
import type { BoardView } from "./game/BoardView";
import type { GameHud } from "./game/GameHud";
import type { MonsterTooltip } from "./game/MonsterTooltip";
import type { MonsterSpriteView } from "./game/MonsterSpriteView";
import type {
    BoardActionMode,
    BoardObstacle,
    DiceReserve,
    DiceSymbol,
    GameActionLogEntry,
    GameSnapshot,
    Monster,
    MonsterAttack,
    PlacedMonster,
    PlayerId,
    Position,
    RolledDie,
} from "../types/GameTypes";
import { isGameSnapshot } from "./GameSceneProtocol";

function resolveBoard(data?: Partial<GameSetup>): BoardDefinition {
    if (data?.board !== undefined) {
        const board = parseBoardDefinition(data.board);
        if (!board) throw new Error("La définition du plateau est invalide.");
        return board;
    }
    return data?.boardSelection ? resolveBoardSelection(data.boardSelection) : getDefaultBoard();
}

export abstract class GameSceneData extends Phaser.Scene {
    protected boardGraphics!: Phaser.GameObjects.Graphics;
    protected uiContainer!: Phaser.GameObjects.Container;
    protected tooltipContainer!: Phaser.GameObjects.Container;
    protected boardView!: BoardView;
    protected gameHud!: GameHud;
    protected monsterTooltip!: MonsterTooltip;
    protected monsterSpriteView!: MonsterSpriteView;
    protected currentPlayer!: PlayerId;
    protected turnNumber!: number;
    protected playerHealth!: Record<PlayerId, number>;
    protected gameConfiguration!: GameConfiguration;
    protected playerDecks!: Record<PlayerId, string[]>;
    protected computerOpponent!: boolean;
    protected opponentProfile!: BotProfile;
    protected playerProfile!: BotProfile;
    protected botOptions!: BotDecisionOptions;
    protected botStrategyWeights!: BotStrategyWeightMap;
    protected mode!: GameSetup["mode"];
    protected localPlayer!: PlayerId;
    protected isHost!: boolean;
    protected computerTurnInProgress!: boolean;
    protected hasGameSetup!: boolean;
    protected assetsReady!: boolean;
    protected winner!: PlayerId | null;
    protected hasRolled!: boolean;
    protected rolledDice!: RolledDie[];
    protected diceReserves!: Record<PlayerId, DiceReserve>;
    protected actionMode!: BoardActionMode;
    protected selectedMonster!: Monster | null;
    protected selectedPattern!: number;
    protected patternRotation!: number;
    protected patternMirrored!: boolean;
    protected patternSelectorExpanded!: boolean;
    protected invocationMenuOpen!: boolean;
    protected pendingCells!: Position[] | null;
    protected placedMonsters!: PlacedMonster[];
    protected obstacles!: BoardObstacle[];
    protected actionHistory!: GameActionLogEntry[];
    protected actionHistoryScrollOffset!: number;
    protected hoveredCell!: Position | null;
    protected lockedPreviewCell!: Position | null;
    protected hasLeftLockedPreviewBoard!: boolean;
    protected hoveredInvocationMonster!: Monster | null;
    protected nextMonsterId!: number;
    protected randomStreams!: MatchRandomStreams;
    protected pendingResumeSnapshot!: GameSnapshot | null;
    protected board!: BoardDefinition;
    protected startingPositions!: Record<PlayerId, Position>;

    constructor() {
        super("GameScene");
    }

    init(data?: Partial<GameSetup>): void {
        const configuration = data?.configuration
            ? parseGameConfiguration(data.configuration)
            : getDefaultGameConfiguration();
        if (!configuration) throw new Error("La configuration de partie est invalide.");

        this.hasGameSetup = data?.mode !== undefined;
        this.pendingResumeSnapshot =
            data?.resumeSnapshot && isGameSnapshot(data.resumeSnapshot)
                ? data.resumeSnapshot
                : null;
        this.gameConfiguration = configuration;
        this.board = resolveBoard(data);
        this.startingPositions = getStartingPositions(this.board);
        this.currentPlayer = 1;
        this.turnNumber = 1;
        this.playerHealth = {
            1: configuration.initialPlayerHealth,
            2: configuration.initialPlayerHealth,
        };
        this.mode = data?.mode ?? "computer";
        this.computerOpponent = data?.mode === "computer";
        this.opponentProfile = data?.opponentProfile ?? "balanced";
        this.playerProfile = data?.playerProfile ?? "balanced";
        if (
            !BOT_PROFILES.includes(this.opponentProfile) ||
            !BOT_PROFILES.includes(this.playerProfile)
        ) {
            throw new Error("Le profil de bot est invalide.");
        }
        const botOptions =
            data?.botOptions === undefined ? {} : parseBotDecisionOptions(data.botOptions);
        const botStrategyWeights =
            data?.botStrategyWeights === undefined
                ? {}
                : parseBotStrategyWeightMap(data.botStrategyWeights);
        if (!botOptions || !botStrategyWeights)
            throw new Error("La configuration du bot est invalide.");
        this.botOptions = botOptions;
        this.botStrategyWeights = botStrategyWeights;
        this.localPlayer = data?.localPlayer ?? 1;
        this.playerDecks = getPlayerDecks(
            parseDeck(data?.playerDeck, configuration.deckSize) ??
                getDefaultDeck(configuration.deckSize),
            parseDeck(data?.opponentDeck, configuration.deckSize) ??
                getDefaultDeck(configuration.deckSize),
            this.localPlayer,
        );
        this.isHost = data?.isHost ?? true;
        this.computerTurnInProgress = false;
        this.assetsReady = false;
        this.winner = null;
        this.hasRolled = false;
        this.rolledDice = [];
        this.diceReserves = { 1: createEmptyDiceReserve(), 2: createEmptyDiceReserve() };
        this.actionMode = { type: "idle" };
        this.selectedMonster = null;
        this.selectedPattern = 0;
        this.patternRotation = 0;
        this.patternMirrored = false;
        this.patternSelectorExpanded = true;
        this.invocationMenuOpen = false;
        this.pendingCells = null;
        this.placedMonsters = [];
        this.obstacles = [];
        this.actionHistory = [];
        this.actionHistoryScrollOffset = 0;
        this.hoveredCell = null;
        this.lockedPreviewCell = null;
        this.hasLeftLockedPreviewBoard = false;
        this.hoveredInvocationMonster = null;
        this.nextMonsterId = 1;
        const seed = data?.randomSeed ?? Math.floor(Math.random() * 0x1_0000_0000);
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
            throw new RangeError("La graine de partie est invalide.");
        }
        this.randomStreams = createMatchRandomStreams(seed);
    }

    protected gridToScreen(position: Position): Position {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        const origin = getBoardOrigin(this.board);
        return {
            x: origin.x + ((position.x - position.y) * tileWidth) / 2,
            y: origin.y + ((position.x + position.y) * tileHeight) / 2,
        };
    }

    protected getDeckMonsters(player: PlayerId): Monster[] {
        return this.playerDecks[player]
            .map((id) => this.gameConfiguration.monsters.find((monster) => monster.id === id))
            .filter((monster): monster is Monster => monster !== undefined);
    }

    protected getAvailableSymbols(symbol: DiceSymbol, player = this.currentPlayer): number {
        return getAvailableSymbolCount(symbol, this.rolledDice, this.diceReserves[player]);
    }

    protected spendCurrentSymbol(symbol: DiceSymbol, amount = 1): boolean {
        return spendSymbols(symbol, amount, this.rolledDice, this.diceReserves[this.currentPlayer]);
    }

    protected recordAction(entry: GameActionLogEntry): void {
        this.actionHistory = [...this.actionHistory, entry];
        this.actionHistoryScrollOffset = 0;
    }

    protected getLivingMonsters(owner?: PlayerId): PlacedMonster[] {
        return this.placedMonsters.filter(
            (placed) => placed.currentHp > 0 && (owner === undefined || placed.owner === owner),
        );
    }

    protected getLivingMonsterAt(position: Position): PlacedMonster | undefined {
        return this.placedMonsters.find(
            (placed) => placed.currentHp > 0 && isSamePosition(placed.position, position),
        );
    }

    protected getLivingMonster(id: string): PlacedMonster | undefined {
        return this.placedMonsters.find((placed) => placed.id === id && placed.currentHp > 0);
    }

    protected getOwnedCells(owner: PlayerId): Position[] {
        return this.placedMonsters
            .filter((placed) => placed.owner === owner)
            .flatMap(({ cells }) => cells);
    }

    protected getOccupiedCells(): Position[] {
        return [
            ...Object.values(this.startingPositions),
            ...this.placedMonsters.flatMap(({ cells }) => cells),
        ];
    }

    protected getBlockedCells(): Position[] {
        return [...this.board.blockedCells, ...this.obstacles.map(({ position }) => position)];
    }

    protected hasReachedMonsterLimit(player = this.currentPlayer): boolean {
        return (
            getInvokedMonsterCount(this.placedMonsters, player) >=
            this.gameConfiguration.maxMonstersPerPlayer
        );
    }

    protected getMonsterMovementCost({ monster, turnBuffs }: PlacedMonster): number {
        return getMovementCost(monster, turnBuffs?.movementCostReduction ?? 0);
    }

    protected getMonsterAttackCost({ turnBuffs }: PlacedMonster, attack: MonsterAttack): number {
        return getAttackCost(attack, turnBuffs?.attackCostReduction ?? 0);
    }

    protected createPlacedMonster(
        monster: Monster,
        owner: PlayerId,
        position: Position,
        cells: Position[],
    ): PlacedMonster {
        return createPlacedMonster(
            `monster-${this.nextMonsterId++}`,
            monster,
            owner,
            { ...position },
            cells,
            this.turnNumber,
        );
    }
}
