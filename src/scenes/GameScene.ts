import Phaser from "phaser";

import { GAME_CONFIG } from "../config";
import { DICE } from "../data/dice";
import { MONSTERS } from "../data/monsters";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import {
    createEmptyDiceReserve,
    getAvailableSymbolCount,
    spendSymbols,
    storeRemainingDice,
    storeRolledDie,
} from "../game/diceResources";
import {
    canAttackMonster,
    advanceAttackCooldowns,
    canUseActionThisTurn,
    getAttackZoneOptions,
    getFacingFromMovement,
    getGridDistance,
    getMovementActionsPerTurn,
    getMovementCost,
    getMonsterMovementPath,
    isBehind,
    type MovementOptions,
} from "../game/monsterActions";
import { canPlaceCells, findValidPlacement, getPatternCells } from "../game/placement";
import { getDefaultDeck, parseDeck, type GameSetup } from "../game/decks";
import { BoardView } from "./game/BoardView";
import { ACTION_LOG_VISIBLE_COUNT, GameHud } from "./game/GameHud";
import { MonsterTooltip } from "./game/MonsterTooltip";
import { MonsterSpriteView } from "./game/MonsterSpriteView";

import type { GameHudActions } from "./game/GameHud";
import type { GameViewState } from "./game/GameViewState";
import type {
    BoardActionMode,
    DiceReserve,
    DiceSymbol,
    GameActionLogEntry,
    Monster,
    PlayerId,
    PlacedMonster,
    Position,
    RolledDie,
    GameSnapshot,
    RemoteGameCommand,
} from "../types/GameTypes";

function isRemoteGameCommand(value: unknown): value is RemoteGameCommand {
    if (typeof value !== "object" || value === null || !("type" in value)) return false;

    switch (value.type) {
        case "rollDice":
        case "rotatePattern":
        case "mirrorPattern":
        case "togglePatternSelector":
        case "toggleInvocationMenu":
        case "startAttack":
        case "startMovement":
        case "cancelBoardAction":
        case "finishTurn":
            return true;
        case "selectMonster":
            return "monsterId" in value && typeof value.monsterId === "string";
        case "selectPattern":
        case "selectAttack":
        case "storeDie":
            return "index" in value
                ? Number.isInteger(value.index)
                : "attackIndex" in value
                  ? Number.isInteger(value.attackIndex)
                  : "dieIndex" in value && Number.isInteger(value.dieIndex);
        case "boardClick":
            return (
                "position" in value &&
                typeof value.position === "object" &&
                value.position !== null &&
                "x" in value.position &&
                "y" in value.position &&
                Number.isInteger(value.position.x) &&
                Number.isInteger(value.position.y)
            );
        default:
            return false;
    }
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
    if (typeof value !== "object" || value === null) return false;

    return (
        "currentPlayer" in value &&
        (value.currentPlayer === 1 || value.currentPlayer === 2) &&
        "turnNumber" in value &&
        typeof value.turnNumber === "number" &&
        Number.isInteger(value.turnNumber) &&
        value.turnNumber > 0 &&
        "playerHealth" in value &&
        typeof value.playerHealth === "object" &&
        value.playerHealth !== null &&
        "rolledDice" in value &&
        Array.isArray(value.rolledDice) &&
        "diceReserves" in value &&
        typeof value.diceReserves === "object" &&
        value.diceReserves !== null &&
        "placedMonsters" in value &&
        Array.isArray(value.placedMonsters) &&
        "actionHistory" in value &&
        Array.isArray(value.actionHistory)
    );
}

export class GameScene extends Phaser.Scene {
    private boardGraphics!: Phaser.GameObjects.Graphics;
    private uiContainer!: Phaser.GameObjects.Container;
    private tooltipContainer!: Phaser.GameObjects.Container;
    private boardView!: BoardView;
    private gameHud!: GameHud;
    private monsterTooltip!: MonsterTooltip;
    private monsterSpriteView!: MonsterSpriteView;

    private currentPlayer: PlayerId = 1;
    private turnNumber = 1;
    private playerHealth: Record<PlayerId, number> = { 1: 3, 2: 3 };
    private playerDecks: Record<PlayerId, string[]> = {
        1: getDefaultDeck(),
        2: getDefaultDeck(),
    };
    private computerOpponent = false;
    private mode: GameSetup["mode"] = "computer";
    private localPlayer: PlayerId = 1;
    private isHost = true;
    private computerTurnInProgress = false;
    private winner: PlayerId | null = null;
    private hasRolled = false;
    private rolledDice: RolledDie[] = [];
    private diceReserves: Record<PlayerId, DiceReserve> = {
        1: createEmptyDiceReserve(),
        2: createEmptyDiceReserve(),
    };
    private actionMode: BoardActionMode = { type: "idle" };
    private selectedMonster: Monster | null = null;
    private selectedPattern = 0;
    private patternRotation = 0;
    private patternMirrored = false;
    private patternSelectorExpanded = true;
    private invocationMenuOpen = true;
    private pendingCells: Position[] | null = null;
    private placedMonsters: PlacedMonster[] = [];
    private actionHistory: GameActionLogEntry[] = [];
    private actionHistoryScrollOffset = 0;
    private hoveredCell: Position | null = null;
    private hoveredInvocationMonster: Monster | null = null;
    private nextMonsterId = 1;

    private readonly startingPositions: Record<PlayerId, Position> = {
        1: { x: 0, y: 9 },
        2: { x: 18, y: 9 },
    };

    constructor() {
        super("GameScene");
    }

    preload(): void {
        MonsterSpriteView.preload(this);
    }

    init(data?: Partial<GameSetup>): void {
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
        this.invocationMenuOpen = true;
        this.pendingCells = null;
        this.placedMonsters = [];
        this.actionHistory = [];
        this.actionHistoryScrollOffset = 0;
        this.hoveredCell = null;
        this.hoveredInvocationMonster = null;
        this.nextMonsterId = 1;
    }

    create(): void {
        this.cameras.main.setBackgroundColor("#202a36");
        this.boardGraphics = this.add.graphics();
        this.uiContainer = this.add.container(0, 0).setDepth(2);
        this.tooltipContainer = this.add.container(0, 0).setDepth(10);

        this.boardView = new BoardView(this, this.boardGraphics, (position) =>
            this.gridToScreen(position),
        );
        this.monsterSpriteView = new MonsterSpriteView(this, (position) =>
            this.gridToScreen(position),
        );
        this.gameHud = new GameHud(this, this.uiContainer);
        this.monsterTooltip = new MonsterTooltip(
            this,
            this.tooltipContainer,
            (position) => this.gridToScreen(position),
            (monster, facing, container, x, y, spriteFacingOverride) =>
                this.monsterSpriteView.createPreview(
                    monster,
                    facing,
                    container,
                    x,
                    y,
                    spriteFacingOverride,
                ),
        );

        this.render();
        this.bindInput();
        this.game.events.on("remote-game-command", this.handleRemoteCommand, this);
        this.game.events.on("remote-game-state", this.applyRemoteSnapshot, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off("remote-game-command", this.handleRemoteCommand, this);
            this.game.events.off("remote-game-state", this.applyRemoteSnapshot, this);
        });
    }

    private bindInput(): void {
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            this.hoveredCell = this.boardView.screenToGrid({ x: pointer.x, y: pointer.y });
            this.monsterTooltip.update(
                pointer,
                this.placedMonsters,
                this.hoveredInvocationMonster,
                this.currentPlayer,
            );
            this.drawBoard();
        });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.winner !== null) return;
            if (pointer.y < 100 || pointer.y >= 570) return;

            const cell = this.boardView.screenToGrid({ x: pointer.x, y: pointer.y });
            if (!this.boardView.isInsideBoard(cell)) return;
            this.runLocalCommand({ type: "boardClick", position: cell }, () =>
                this.tryPlaceMonster(cell),
            );
        });
    }

    private gridToScreen(position: Position): Position {
        const { tileWidth, tileHeight, boardOffsetX, boardOffsetY } = GAME_CONFIG;
        return {
            x: boardOffsetX + ((position.x - position.y) * tileWidth) / 2,
            y: boardOffsetY + ((position.x + position.y) * tileHeight) / 2,
        };
    }

    private get viewState(): GameViewState {
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
        };
    }

    private get hudActions(): GameHudActions {
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
                );
            },
            storeDie: (dieIndex) =>
                this.runLocalCommand({ type: "storeDie", dieIndex }, () => this.storeDie(dieIndex)),
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
            finishTurn: () => this.runLocalCommand({ type: "finishTurn" }, () => this.finishTurn()),
            scrollActionHistory: (offset) => this.scrollActionHistory(offset),
        };
    }

    private render(): void {
        this.drawBoard();
        this.monsterSpriteView.render(this.placedMonsters, this.winner !== null);
        this.gameHud.render(this.viewState, this.hudActions);
        if (this.mode === "online" && this.isHost) {
            this.game.events.emit("remote-game-state-out", this.createSnapshot());
        }
    }

    private runLocalCommand(command: RemoteGameCommand, action: () => void): void {
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

    private handleRemoteCommand(value: unknown): void {
        if (
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
            case "storeDie":
                this.storeDie(value.dieIndex);
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
            case "boardClick":
                this.tryPlaceMonster(value.position);
                break;
        }
    }

    private createSnapshot(): GameSnapshot {
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

    private applyRemoteSnapshot(value: unknown): void {
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

    private drawBoard(): void {
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

    private rollDice(computerInitiated = false): void {
        if (this.hasRolled || this.winner !== null) return;
        if (
            this.computerOpponent &&
            this.currentPlayer === 2 &&
            this.computerTurnInProgress &&
            !computerInitiated
        ) {
            return;
        }

        this.rolledDice = DICE.map((die) => ({
            definitionId: die.id,
            symbol: die.faces[Phaser.Math.Between(0, die.faces.length - 1)],
            status: "available",
        }));
        this.hasRolled = true;
        this.selectedMonster = null;
        this.pendingCells = null;
        this.actionMode = { type: "idle" };
        this.render();
    }

    private selectMonster(monsterId: string): void {
        const monster = this.getDeckMonsters(this.currentPlayer).find(
            (candidate) => candidate.id === monsterId,
        );
        if (
            !monster ||
            this.pendingCells ||
            this.actionMode.type !== "idle" ||
            getAvailableSymbolCount(
                "invocation",
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            ) < monster.cost
        ) {
            return;
        }

        this.selectedMonster = monster;
        this.render();
    }

    private selectPattern(index: number): void {
        if (this.pendingCells || !PLACEMENT_PATTERNS[index]) return;

        this.selectedPattern = index;
        this.render();
    }

    private rotatePattern(): void {
        if (this.pendingCells) return;

        this.patternRotation = (this.patternRotation + 1) % 4;
        this.render();
    }

    private mirrorPattern(): void {
        if (this.pendingCells || this.actionMode.type !== "idle") return;

        this.patternMirrored = !this.patternMirrored;
        this.render();
    }

    private togglePatternSelector(): void {
        this.patternSelectorExpanded = !this.patternSelectorExpanded;
        this.render();
    }

    private toggleInvocationMenu(): void {
        this.invocationMenuOpen = !this.invocationMenuOpen;
        this.render();
    }

    private getMonsterCells(origin: Position): Position[] {
        return getPatternCells(
            PLACEMENT_PATTERNS[this.selectedPattern],
            origin,
            this.patternRotation,
            this.patternMirrored,
        );
    }

    private canPlaceMonster(origin: Position, player = this.currentPlayer): boolean {
        const cells = this.getMonsterCells(origin);
        const occupiedCells = [
            ...Object.values(this.startingPositions),
            ...this.placedMonsters.flatMap((placed) => placed.cells),
        ];
        const ownedPathCells = this.placedMonsters
            .filter((placed) => placed.owner === player)
            .flatMap((placed) => placed.cells);
        const connectedCells = [this.startingPositions[player], ...ownedPathCells];

        return canPlaceCells(
            cells,
            GAME_CONFIG.boardSize,
            occupiedCells,
            connectedCells,
            ownedPathCells,
        );
    }

    private tryPlaceMonster(position: Position): void {
        if (!this.hasRolled) return;
        if (this.actionMode.type !== "idle") {
            this.handleBoardAction(position);
            return;
        }
        if (!this.selectedMonster) return;

        if (this.pendingCells) {
            const isOnDie = this.pendingCells.some(
                (cell) => cell.x === position.x && cell.y === position.y,
            );
            const isOccupied = this.getLivingMonsterAt(position) !== undefined;
            const isStartingCell = Object.values(this.startingPositions).some(
                (start) => start.x === position.x && start.y === position.y,
            );
            if (!isOnDie || isOccupied || isStartingCell) return;

            const didPay = spendSymbols(
                "invocation",
                this.selectedMonster.cost,
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            );
            if (!didPay) return;

            this.placedMonsters.push({
                id: `monster-${this.nextMonsterId++}`,
                monster: this.selectedMonster,
                owner: this.currentPlayer,
                position: { ...position },
                facing: this.currentPlayer === 1 ? "east" : "west",
                currentHp: this.selectedMonster.hp,
                cells: this.pendingCells,
                attacksUsedThisTurn: 0,
                movementsUsedThisTurn: 0,
                attackCooldowns: this.selectedMonster.attacks.map(() => 0),
            });
            this.recordAction({
                type: "invocation",
                player: this.currentPlayer,
                monsterName: this.selectedMonster.name,
                cost: this.selectedMonster.cost,
            });
            this.selectedMonster = null;
            this.pendingCells = null;
            this.render();
            return;
        }

        if (!this.canPlaceMonster(position)) return;

        this.pendingCells = this.getMonsterCells(position);
        this.render();
    }

    private storeDie(dieIndex: number): void {
        if (!this.hasRolled || this.pendingCells || this.actionMode.type !== "idle") return;
        if (storeRolledDie(this.rolledDice, dieIndex, this.diceReserves[this.currentPlayer])) {
            this.render();
        }
    }

    private startAttack(): void {
        if (!this.canStartSymbolAction("attack")) return;
        this.selectedMonster = null;
        this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        this.render();
    }

    private startMovement(): void {
        if (!this.canStartMovement()) return;
        this.selectedMonster = null;
        this.actionMode = { type: "movement", monsterId: null };
        this.render();
    }

    private canStartMovement(): boolean {
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

    private canStartSymbolAction(symbol: DiceSymbol): boolean {
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

    private handleBoardAction(position: Position): void {
        if (this.actionMode.type === "attack") {
            this.handleAttackAction(position, this.actionMode.attackerId);
        } else if (this.actionMode.type === "movement") {
            this.handleMovementAction(position, this.actionMode.monsterId);
        }
    }

    private handleAttackAction(position: Position, attackerId: string | null): void {
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

    private selectAttackMonster(monster: PlacedMonster | undefined): void {
        if (
            monster?.owner !== this.currentPlayer ||
            !canUseActionThisTurn(monster.attacksUsedThisTurn, 1)
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

    private shouldSelectDifferentAttacker(
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

    private getSelectedAttackIndex(): number | null {
        return this.actionMode.type === "attack" ? this.actionMode.attackIndex : null;
    }

    private executeAttack(
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
            attack.pattern.type === "directionalArea"
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

    private executeAreaAttack(
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

    private executeSingleTargetAttack(
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

    private recordAttack(attacker: PlacedMonster, targetName: string, damage: number): void {
        this.recordAction({
            type: "attack",
            player: this.currentPlayer,
            attackerName: attacker.monster.name,
            targetName,
            damage,
        });
    }

    private recordAction(entry: GameActionLogEntry): void {
        this.actionHistory = [...this.actionHistory, entry];
        this.actionHistoryScrollOffset = 0;
    }

    private finishAttack(): void {
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

    private damageOpponentPlayer(): void {
        const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
        this.playerHealth[opponent]--;
        if (this.playerHealth[opponent] === 0) this.winner = this.currentPlayer;
    }

    private isOpponentStartingPosition(position: Position): boolean {
        const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
        const startingPosition = this.startingPositions[opponent];
        return position.x === startingPosition.x && position.y === startingPosition.y;
    }

    private isOpponentStartInAttackZone(
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

    private selectAttack(attackIndex: number): void {
        if (this.actionMode.type !== "attack" || !this.actionMode.attackerId) return;
        const attacker = this.getLivingMonster(this.actionMode.attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) return;

        this.actionMode = { ...this.actionMode, attackIndex };
        this.render();
    }

    private canAttackTarget(
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

    private getAttackRangeCells(attackerId: string, attackIndex: number): Position[] {
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

    private getAttackCandidateCells(attackerId: string, attackIndex: number): Position[] {
        const attacker = this.getLivingMonster(attackerId);
        const attack = attacker?.monster.attacks[attackIndex];
        if (!attacker || !attack || !this.canUseMonsterAttack(attacker, attackIndex)) return [];

        return getAttackZoneOptions(attacker.position, attacker.facing, attack.pattern)
            .map((option) => option.target)
            .filter(
                (cell) =>
                    cell.x >= 0 &&
                    cell.y >= 0 &&
                    cell.x < GAME_CONFIG.boardSize &&
                    cell.y < GAME_CONFIG.boardSize,
            );
    }

    private getAttackPreviewCells(
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

    private canAffordAttack(attack: Monster["attacks"][number]): boolean {
        return (
            getAvailableSymbolCount(
                "attack",
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            ) >= attack.cost
        );
    }

    private canUseMonsterAttack(attacker: PlacedMonster, attackIndex: number): boolean {
        const attack = attacker.monster.attacks[attackIndex];
        return (
            attack !== undefined &&
            attacker.owner === this.currentPlayer &&
            attacker.currentHp > 0 &&
            canUseActionThisTurn(attacker.attacksUsedThisTurn, 1) &&
            (attacker.attackCooldowns[attackIndex] ?? 0) === 0 &&
            this.canAffordAttack(attack)
        );
    }

    private isAttackZoneUsable(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        zone: readonly Position[],
    ): boolean {
        if (attack.movesToZone && !this.getSlimeLanding(attacker, attack, zone)) return false;
        return zone.some((cell) => {
            if (!this.isAttackCellInRange(attacker.position, attack, cell)) return false;
            if (this.isOpponentStartingPosition(cell)) return true;
            const target = this.getLivingMonsterAt(cell);
            if (!target || target.id === attacker.id) return false;
            if (!attack.hitsAllies && target.owner === this.currentPlayer) return false;
            return canAttackMonster(attacker.monster, attack, target.monster);
        });
    }

    private isAttackCellInRange(
        attackerPosition: Position,
        attack: Monster["attacks"][number],
        cell: Position,
    ): boolean {
        return (
            attack.pattern.type !== "jumpArea" ||
            getGridDistance(attackerPosition, cell) <= attack.pattern.range
        );
    }

    private getAttackZoneForTarget(
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

    private getSlimeLanding(
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

    private handleMovementAction(position: Position, monsterId: string | null): void {
        const clickedMonster = this.getLivingMonsterAt(position);
        if (!monsterId) {
            if (
                clickedMonster?.owner === this.currentPlayer &&
                this.canAffordMovement(clickedMonster)
            ) {
                this.actionMode = { type: "movement", monsterId: clickedMonster.id };
                this.render();
            }
            return;
        }

        const monster = this.getLivingMonster(monsterId);
        if (!monster || this.monsterSpriteView.isMoving(monster.id)) return;

        if (
            clickedMonster?.owner === this.currentPlayer &&
            clickedMonster.id !== monster.id &&
            this.canAffordMovement(clickedMonster)
        ) {
            this.actionMode = { type: "movement", monsterId: clickedMonster.id };
            this.render();
            return;
        }

        if (!this.canMoveTo(monster, position)) return;
        const path = getMonsterMovementPath(this.getMovementOptions(monster, position));
        if (path.length < 2) return;
        if (!this.spendCurrentSymbol("movement", getMovementCost(monster.monster))) return;
        monster.movementsUsedThisTurn++;

        const distance = path.length - 1;
        monster.facing = getFacingFromMovement(monster.position, position, monster.facing);
        monster.position = { ...position };
        this.monsterSpriteView.moveMonster(monster.id, path.slice(1), monster.facing, () =>
            this.render(),
        );
        this.recordAction({
            type: "movement",
            player: this.currentPlayer,
            monsterName: monster.monster.name,
            distance,
        });
        if (!this.hasAffordableMovement()) {
            this.actionMode = { type: "idle" };
        }
        this.render();
    }

    private canMoveTo(monster: PlacedMonster, destination: Position): boolean {
        if (!this.canAffordMovement(monster)) return false;
        return getMonsterMovementPath(this.getMovementOptions(monster, destination)).length > 1;
    }

    private canAffordMovement(monster: PlacedMonster): boolean {
        return (
            monster.owner === this.currentPlayer &&
            monster.currentHp > 0 &&
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            ) &&
            getMovementCost(monster.monster) <=
                getAvailableSymbolCount(
                    "movement",
                    this.rolledDice,
                    this.diceReserves[this.currentPlayer],
                )
        );
    }

    private hasAffordableMovement(): boolean {
        return this.placedMonsters.some((monster) => this.canAffordMovement(monster));
    }

    private getMovementOptions(monster: PlacedMonster, destination: Position): MovementOptions {
        const deployedCells = this.placedMonsters.flatMap((placed) => placed.cells);
        const occupiedCells = this.placedMonsters
            .filter((placed) => placed.currentHp > 0 && placed.id !== monster.id)
            .map((placed) => placed.position);
        const hostileCells = this.placedMonsters
            .filter(
                (placed) =>
                    placed.currentHp > 0 &&
                    placed.owner !== monster.owner &&
                    placed.id !== monster.id,
            )
            .map((placed) => placed.position);
        const startingCells = Object.values(this.startingPositions);

        return {
            source: monster.position,
            destination,
            deployedCells,
            occupiedCells,
            blockedCells: startingCells,
            range: monster.monster.movementRange,
            hostileCells,
            canPassHostiles: monster.monster.flying === true,
            boardSize: GAME_CONFIG.boardSize,
        };
    }

    private getMovementCandidates(monsterId: string): Position[] {
        const monster = this.getLivingMonster(monsterId);
        if (!monster) return [];

        const candidates: Position[] = [];
        for (let y = 0; y < GAME_CONFIG.boardSize; y++) {
            for (let x = 0; x < GAME_CONFIG.boardSize; x++) {
                if (
                    getGridDistance(monster.position, { x, y }) > 0 &&
                    getGridDistance(monster.position, { x, y }) <= monster.monster.movementRange
                ) {
                    candidates.push({ x, y });
                }
            }
        }
        return candidates;
    }

    private getLivingMonsterAt(position: Position): PlacedMonster | undefined {
        return this.placedMonsters.find(
            (placed) =>
                placed.currentHp > 0 &&
                placed.position.x === position.x &&
                placed.position.y === position.y,
        );
    }

    private getLivingMonster(id: string): PlacedMonster | undefined {
        return this.placedMonsters.find((placed) => placed.id === id && placed.currentHp > 0);
    }

    private spendCurrentSymbol(symbol: DiceSymbol, amount = 1): boolean {
        return spendSymbols(symbol, amount, this.rolledDice, this.diceReserves[this.currentPlayer]);
    }

    private cancelBoardAction(): void {
        this.actionMode = { type: "idle" };
        this.render();
    }

    private scrollActionHistory(offset: number): void {
        this.actionHistoryScrollOffset = Phaser.Math.Clamp(
            offset,
            0,
            Math.max(0, this.actionHistory.length - ACTION_LOG_VISIBLE_COUNT),
        );
        this.render();
    }

    private finishTurn(): void {
        if (!this.hasRolled || this.winner !== null) return;
        storeRemainingDice(this.rolledDice, this.diceReserves[this.currentPlayer]);
        this.endTurn();
    }

    private endTurn(): void {
        const previousPlayer = this.currentPlayer;
        this.currentPlayer = previousPlayer === 1 ? 2 : 1;
        if (previousPlayer === 2) this.turnNumber++;
        for (const monster of this.placedMonsters) {
            if (monster.owner !== this.currentPlayer) continue;
            monster.attacksUsedThisTurn = 0;
            monster.movementsUsedThisTurn = 0;
            monster.attackCooldowns = advanceAttackCooldowns(monster.attackCooldowns);
        }
        this.hasRolled = false;
        this.rolledDice = [];
        this.selectedMonster = null;
        this.pendingCells = null;
        this.hoveredCell = null;
        this.actionMode = { type: "idle" };
        this.render();
        if (this.computerOpponent && this.currentPlayer === 2 && this.winner === null) {
            this.computerTurnInProgress = true;
            this.time.delayedCall(450, () => this.playComputerTurn());
        } else {
            this.computerTurnInProgress = false;
        }
    }

    private getDeckMonsters(player: PlayerId): Monster[] {
        return this.playerDecks[player]
            .map((id) => MONSTERS.find((monster) => monster.id === id))
            .filter((monster): monster is Monster => monster !== undefined);
    }

    private playComputerTurn(): void {
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

    private deployComputerMonsters(): void {
        let deployments = 0;
        while (deployments < this.playerDecks[2].length) {
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
                    attackCooldowns: monster.attacks.map(() => 0),
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

    private findComputerPlacement(): { position: Position; cells: Position[] } | null {
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
            boardSize: GAME_CONFIG.boardSize,
            start: this.startingPositions[2],
            occupiedCells,
            connectedCells: computerTerritory,
            overlappingCells: computerPathCells,
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
                const crossesEnemyTerritory = cells.some((cell) =>
                    opponentTerritoryKeys.has(`${cell.x},${cell.y}`),
                );
                return (
                    !isStartingCell && !isMonsterOccupied && addsTerritory && !crossesEnemyTerritory
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

    private playComputerAttacks(): void {
        while (this.hasComputerAttackResource()) {
            if (!this.performComputerAttack()) break;
        }
    }

    private hasComputerAttackResource(): boolean {
        return (
            this.winner === null &&
            getAvailableSymbolCount("attack", this.rolledDice, this.diceReserves[2]) > 0
        );
    }

    private performComputerAttack(): boolean {
        const attackers = this.placedMonsters.filter(
            (monster) => monster.owner === 2 && monster.currentHp > 0,
        );
        for (const attacker of attackers) {
            if (this.performComputerAttackWith(attacker)) return true;
        }
        return false;
    }

    private performComputerAttackWith(attacker: PlacedMonster): boolean {
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
