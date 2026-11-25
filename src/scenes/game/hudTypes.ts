import type Phaser from "phaser";
import type { DiceSymbol, Monster } from "../../types/GameTypes";

export interface GameHudActions {
    rollDice: () => void;
    selectMonster: (monsterId: string) => void;
    selectPattern: (index: number) => void;
    rotatePattern: () => void;
    mirrorPattern: () => void;
    togglePatternSelector: () => void;
    toggleInvocationMenu: () => void;
    cancelInvocation: () => void;
    hoverInvocationMonster: (monster: Monster | null, pointer: Phaser.Input.Pointer) => void;
    storeDie: (dieIndex: number) => void;
    selectReserveSymbol: (symbol: DiceSymbol) => void;
    chooseReserveConversionTarget: (symbol: DiceSymbol) => void;
    startAttack: () => void;
    selectAttack: (attackIndex: number) => void;
    startMovement: () => void;
    cancelBoardAction: () => void;
    finishTurn: () => void;
    leaveGame: () => void;
    scrollActionHistory: (offset: number) => void;
}

export interface ButtonOptions {
    enabled?: boolean;
    rightAligned?: boolean;
    muted?: boolean;
    uniformSize?: boolean;
    centerVertically?: boolean;
    fontSize?: number;
    width?: number;
    height?: number;
}

export type RectStroke = readonly [width: number, color: number, alpha?: number];
