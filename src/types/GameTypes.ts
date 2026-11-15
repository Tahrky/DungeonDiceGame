export type PlayerId = 1 | 2;

export type DiceSymbol = "invocation" | "attack" | "movement";

export type BoardCellHeight = -1 | 0 | 1;
export type BoardHeightChange = 1 | -1;

export type MonsterAttackAnimation = "attack" | "alternativeAttack1" | "backstab";

export interface BoardObstacle {
    height: -1 | 1;
    position: Position;
}

export type RemoteGameCommand =
    | { type: "rollDice" }
    | { type: "selectMonster"; monsterId: string }
    | { type: "selectPattern"; index: number }
    | { type: "rotatePattern" }
    | { type: "mirrorPattern" }
    | { type: "togglePatternSelector" }
    | { type: "toggleInvocationMenu" }
    | { type: "cancelInvocation" }
    | { type: "storeDie"; dieIndex: number }
    | { type: "selectReserveSymbol"; symbol: DiceSymbol }
    | { type: "convertReserveSymbols"; targetSymbol: DiceSymbol }
    | { type: "startAttack" }
    | { type: "selectAttack"; attackIndex: number }
    | { type: "startMovement" }
    | { type: "cancelBoardAction" }
    | { type: "finishTurn" }
    | { type: "debugAddSymbols" }
    | { type: "changeCellHeight"; delta: BoardHeightChange; position: Position }
    | { type: "boardClick"; position: Position };

export interface GameSnapshot {
    currentPlayer: PlayerId;
    turnNumber: number;
    playerHealth: Record<PlayerId, number>;
    winner: PlayerId | null;
    hasRolled: boolean;
    rolledDice: RolledDie[];
    diceReserves: Record<PlayerId, DiceReserve>;
    actionMode: BoardActionMode;
    selectedMonsterId: string | null;
    selectedPattern: number;
    patternRotation: number;
    patternMirrored: boolean;
    patternSelectorExpanded: boolean;
    invocationMenuOpen: boolean;
    pendingCells: Position[] | null;
    placedMonsters: PlacedMonster[];
    obstacles: BoardObstacle[];
    actionHistory: GameActionLogEntry[];
    actionHistoryScrollOffset: number;
    nextMonsterId: number;
}

export type DiceReserve = Record<DiceSymbol, number>;

export interface DieDefinition {
    id: string;
    faces: readonly DiceSymbol[];
}

export interface RolledDie {
    definitionId: string;
    symbol: DiceSymbol;
    status: "available" | "stored" | "spent";
}

export type BoardActionMode =
    | { type: "idle" }
    | { type: "attack"; attackerId: string | null; attackIndex: number | null }
    | { type: "movement"; monsterId: string | null }
    | { type: "convertSymbols"; selectedSymbols: DiceSymbol[] };

export interface Position {
    x: number;
    y: number;
}

export type Facing = "north" | "east" | "south" | "west";

export type AttackPattern =
    | { type: "adjacent" }
    | {
          type: "line";
          range: number;
          minRange?: number;
          length?: number;
          allDirections?: boolean;
      }
    | { type: "area"; range: number; width: number; depth: number }
    | { type: "directionalArea"; width: number; depth: number }
    | { type: "selfRadius"; range: number }
    | { type: "jumpArea"; range: number; width: 2; depth: 2 }
    | { type: "radius"; range: number };

export interface MonsterAttack {
    name: string;
    damage: number;
    cost: number;
    pattern: AttackPattern;
    /** Sprite animation key; defaults to "attack". */
    animation?: MonsterAttackAnimation;
    cooldownTurns?: number;
    initialCooldownTurns?: number;
    usesPerTurn?: number;
    hitsAllies?: boolean;
    targetsAlliesOnly?: boolean;
    healAmount?: number;
    cooldownReduction?: number;
    movesToZone?: boolean;
}

export interface Monster {
    id: string;
    name: string;
    symbol: string;
    color: number;

    cost: number;
    hp: number;
    attacks: MonsterAttack[];
    movementRange: number;
    attackActionsPerTurn?: number;
    movementActionsPerTurn?: number;
    movementCost?: number;
    flying?: boolean;
    bonusDamageFromBehind?: number;
}

export interface PlacedMonster {
    id: string;
    monster: Monster;
    owner: PlayerId;
    position: Position;
    facing: Facing;
    currentHp: number;
    cells: Position[];
    attacksUsedThisTurn: number;
    attackUsesThisTurn: number[];
    movementsUsedThisTurn: number;
    attackCooldowns: number[];
}

export type GameActionLogEntry =
    | { type: "invocation"; player: PlayerId; monsterName: string; cost: number }
    | { type: "movement"; player: PlayerId; monsterName: string; distance: number }
    | {
          type: "attack";
          player: PlayerId;
          attackerName: string;
          targetName: string;
          damage: number;
          effect?: string;
      };
