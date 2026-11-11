import type { Facing, PlayerId } from "../types/GameTypes";

export type MonsterSpriteAction =
    | "idle"
    | "move"
    | "attack"
    | "strongAttack"
    | "backstab"
    | "hit"
    | "death";

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
          readonly playerSpriteSheets?: Readonly<Record<PlayerId, string>>;
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
const THIEF_ASSET_ROOT = "/sprites/thief";

function teamAtlas(
    assetRoot: string,
    file: string,
): Pick<
    Extract<MonsterSpriteAnimation, { spriteSheet: string }>,
    "spriteSheet" | "playerSpriteSheets" | "framesPerRow" | "rows"
> {
    return {
        spriteSheet: file === "Idle" ? `${assetRoot}/${file}.png` : `${assetRoot}/red/${file}.png`,
        playerSpriteSheets: {
            1: `${assetRoot}/red/${file}.png`,
            2: `${assetRoot}/blue/${file}.png`,
        },
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
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(ARCHER_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(ARCHER_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...teamAtlas(ARCHER_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...teamAtlas(ARCHER_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(ARCHER_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    ghost: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(GHOST_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(GHOST_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...teamAtlas(GHOST_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...teamAtlas(GHOST_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(GHOST_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    "black-knight": {
        frameWidth: 128,
        frameHeight: 128,
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Attack"),
            },
            strongAttack: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Attack"),
                frameRange: [7, 14],
            },
            death: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 4,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    "frost-mage": {
        frameWidth: 128,
        frameHeight: 128,
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(FROST_MAGE_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(FROST_MAGE_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...teamAtlas(FROST_MAGE_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...teamAtlas(FROST_MAGE_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(FROST_MAGE_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    pirate: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(PIRATE_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(PIRATE_ASSET_ROOT, "Attack"),
            },
            death: {
                frameRate: 8,
                ...teamAtlas(PIRATE_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...teamAtlas(PIRATE_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(PIRATE_ASSET_ROOT, "TakeDamage"),
            },
        },
    },

    thief: {
        frameWidth: 128,
        frameHeight: 128,
        scale: 0.9,
        previewScale: 1.8,
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
                ...teamAtlas(THIEF_ASSET_ROOT, "Idle"),
            },
            attack: {
                frameRate: 8,
                ...teamAtlas(THIEF_ASSET_ROOT, "Attack"),
            },
            backstab: {
                frameRate: 8,
                ...teamAtlas(THIEF_ASSET_ROOT, "AttackBackstab"),
            },
            death: {
                frameRate: 8,
                ...teamAtlas(THIEF_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 12,
                ...teamAtlas(THIEF_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(THIEF_ASSET_ROOT, "TakeDamage"),
            },
        },
    },
};
