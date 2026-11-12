import type {
    BoardActionMode,
    DiceReserve,
    GameActionLogEntry,
    Monster,
    PlayerId,
    PlacedMonster,
    Position,
    RolledDie,
} from "../../types/GameTypes";

export interface GameViewState {
    currentPlayer: PlayerId;
    turnNumber: number;
    playerHealth: Record<PlayerId, number>;
    playerMaxHealth: number;
    maxMonstersPerPlayer: number;
    availableMonsters: Monster[];
    computerOpponent: boolean;
    onlineGame: boolean;
    isLocalTurn: boolean;
    winner: PlayerId | null;
    hasRolled: boolean;
    rolledDice: RolledDie[];
    diceReserves: Record<PlayerId, DiceReserve>;
    actionMode: BoardActionMode;
    selectedMonster: Monster | null;
    selectedPattern: number;
    patternRotation: number;
    patternMirrored: boolean;
    patternSelectorExpanded: boolean;
    invocationMenuOpen: boolean;
    pendingCells: Position[] | null;
    placedMonsters: PlacedMonster[];
    actionHistory: GameActionLogEntry[];
    actionHistoryScrollOffset: number;
    hoveredCell: Position | null;
    startingPositions: Record<PlayerId, Position>;
    boardOrigin: Position;
}
