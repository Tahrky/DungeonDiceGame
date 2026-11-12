export type PlayerId = 1 | 2;

export type DiceSymbol = "invocation" | "attack" | "movement";

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
    | { type: "startAttack" }
    | { type: "selectAttack"; attackIndex: number }
    | { type: "startMovement" }
    | { type: "cancelBoardAction" }
    | { type: "finishTurn" }
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
    | { type: "movement"; monsterId: string | null };

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
    | { type: "jumpArea"; range: number; width: 2; depth: 2 }
    | { type: "radius"; range: number };

export interface MonsterAttack {
    name: string;
    damage: number;
    cost: number;
    pattern: AttackPattern;
    cooldownTurns?: number;
    hitsAllies?: boolean;
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
      };
