import type { Facing, MonsterAttackAnimation } from "../types/GameTypes";

export type MonsterSpriteAction = "idle" | "move" | MonsterAttackAnimation | "hit" | "death";

export type MonsterSpriteFacing =
    "east" | "southEast" | "south" | "southWest" | "west" | "northWest" | "north" | "northEast";

export const GRID_FACING_TO_SPRITE_FACING: Readonly<Record<Facing, MonsterSpriteFacing>> = {
    north: "northEast",
    east: "southEast",
    south: "southWest",
    west: "northWest",
};

export type MonsterSpriteAnimation =
    | {
          readonly frameRate: number;
          readonly files: Readonly<Record<Facing, string>>;
      }
    | {
          readonly frameRate: number;
          readonly spriteSheet: string;
          readonly framesPerRow: number;
          readonly rows: Readonly<Record<MonsterSpriteFacing, number>>;
      };

export interface MonsterSpriteDefinition {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly scale: number;
    readonly previewScale?: number;
    readonly previewOffsetX?: number;
    readonly previewOffsetY?: number;
    readonly tooltipVerticalPadding?: number;
    readonly originX: number;
    readonly originY: number;
    readonly facingOffsetY?: Readonly<Partial<Record<Facing, number>>>;
    readonly animations: Readonly<Partial<Record<MonsterSpriteAction, MonsterSpriteAnimation>>>;
}

type AnimationSpec = readonly [file: string, frameRate?: number];

const DEFAULT_FRAME_RATE = 8;
const ATLAS_FRAMES_PER_ROW = 15;
const ATLAS_ROWS: Readonly<Record<MonsterSpriteFacing, number>> = {
    east: 0,
    southEast: 1,
    south: 2,
    southWest: 3,
    west: 4,
    northWest: 5,
    north: 6,
    northEast: 7,
};

const DEFAULT_ANIMATIONS: Readonly<Partial<Record<MonsterSpriteAction, AnimationSpec>>> = {
    idle: ["Idle"],
    attack: ["Attack"],
    death: ["Die"],
    move: ["Walk"],
    hit: ["TakeDamage"],
};

const DEFAULT_LAYOUT = {
    frameWidth: 128,
    frameHeight: 128,
    scale: 1,
    previewScale: 2,
    previewOffsetX: -2,
    previewOffsetY: -12,
    originX: 0.5,
    originY: 0.67,
    facingOffsetY: { north: 8, east: 4, south: 4, west: 8 },
} as const;

function monsterSprite(
    folder: string,
    overrides: Readonly<Partial<Record<MonsterSpriteAction, AnimationSpec>>> = {},
): MonsterSpriteDefinition {
    const animations: Partial<Record<MonsterSpriteAction, MonsterSpriteAnimation>> = {};
    const specs = Object.entries({ ...DEFAULT_ANIMATIONS, ...overrides }) as [
        MonsterSpriteAction,
        AnimationSpec,
    ][];
    for (const [action, [file, frameRate = DEFAULT_FRAME_RATE]] of specs) {
        animations[action] = {
            frameRate,
            spriteSheet: `/sprites/${folder}/${file}.png`,
            framesPerRow: ATLAS_FRAMES_PER_ROW,
            rows: ATLAS_ROWS,
        };
    }
    return { ...DEFAULT_LAYOUT, animations };
}

export const MONSTER_SPRITES: Readonly<Record<string, MonsterSpriteDefinition>> = {
    archer: monsterSprite("archer", { alternativeAttack1: ["AttackPuissante"] }),
    ghost: monsterSprite("ghost"),
    spectre: monsterSprite("spectre", { alternativeAttack1: ["AttackAoe", 15] }),
    "black-knight": monsterSprite("blackKnight", {
        attack: ["Attack", 10],
        alternativeAttack1: ["AttackPuissante", 15],
        move: ["Walk", 4],
    }),
    "frost-mage": monsterSprite("frostMage", { alternativeAttack1: ["AttackAoe", 15] }),
    "swamp-thing": monsterSprite("swampThing", { alternativeAttack1: ["AttackAoe", 15] }),
    pirate: monsterSprite("pirate"),
    thief: monsterSprite("thief", { backstab: ["AttackBackstab"], move: ["Walk", 12] }),
    priest: monsterSprite("priest", {
        attack: ["Soin"],
        alternativeAttack1: ["Benediction", 15],
    }),
    shaman: monsterSprite("shaman", {
        alternativeAttack1: ["AttackAlt", 15],
        alternativeAttack2: ["AttackAlt2", 15],
    }),
};
