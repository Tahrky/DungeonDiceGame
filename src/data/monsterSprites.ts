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
          readonly frameRange?: readonly [number, number];
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

const ARCHER_ASSET_ROOT = "/sprites/archer";
const BLACK_KNIGHT_ASSET_ROOT = "/sprites/blackKnight";
const FROST_MAGE_ASSET_ROOT = "/sprites/frostMage";
const GHOST_ASSET_ROOT = "/sprites/ghost";
const PIRATE_ASSET_ROOT = "/sprites/pirate";
const PRIEST_ASSET_ROOT = "/sprites/priest";
const THIEF_ASSET_ROOT = "/sprites/thief";
const SPECTRE_ASSET_ROOT = "/sprites/spectre";
const SWAMP_ASSET_ROOT = "/sprites/swampThing";
const SHAMAN_ASSET_ROOT = "/sprites/shaman";

function monsterAtlas(
    assetRoot: string,
    file: string,
): Pick<
    Extract<MonsterSpriteAnimation, { spriteSheet: string }>,
    "spriteSheet" | "framesPerRow" | "rows"
> {
    return {
        spriteSheet: `${assetRoot}/${file}.png`,
        framesPerRow: 15,
        rows: {
            east: 0,
            southEast: 1,
            south: 2,
            southWest: 3,
            west: 4,
            northWest: 5,
            north: 6,
            northEast: 7,
        },
    };
}

export const MONSTER_SPRITES: Readonly<Record<string, MonsterSpriteDefinition>> = {
    archer: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "AttackPuissante"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(ARCHER_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    ghost: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(GHOST_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(GHOST_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(GHOST_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(GHOST_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(GHOST_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    spectre: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "AttackAoe"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(SPECTRE_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    "black-knight": {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 10,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "AttackPuissante"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 4,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(BLACK_KNIGHT_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    "frost-mage": {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "AttackAoe"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(FROST_MAGE_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    "swamp-thing": {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "AttackAoe"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(SWAMP_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    pirate: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(PIRATE_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(PIRATE_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(PIRATE_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(PIRATE_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(PIRATE_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    thief: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(THIEF_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(THIEF_ASSET_ROOT, "Attack"),
            },
            backstab: {
                frameRate: 8,
                ...monsterAtlas(THIEF_ASSET_ROOT, "AttackBackstab"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(THIEF_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 12,
                ...monsterAtlas(THIEF_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(THIEF_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    priest: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "Soin"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "Benediction"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(PRIEST_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    shaman: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 1,
        previewScale: 2,
        previewOffsetX: -2,
        previewOffsetY: -12,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 8,
            east: 4,
            south: 4,
            west: 8,
        },
        animations: {
            idle: {
                frameRate: 8,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "Attack"),
            },
            alternativeAttack1: {
                frameRate: 15,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "AttackAlt"),
            },
            alternativeAttack2: {
                frameRate: 15,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "AttackAlt2"),
            },
            death: {
                frameRate: 8,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...monsterAtlas(SHAMAN_ASSET_ROOT, "TakeDamage"),
            },
        },
    },
};
