import type { Facing, PlayerId } from "../types/GameTypes";

export type MonsterSpriteAction = "idle" | "move" | "attack" | "strongAttack" | "hit" | "death";

export type MonsterSpriteFacing =
    | "east"
    | "southEast"
    | "south"
    | "southWest"
    | "west"
    | "northWest"
    | "north"
    | "northEast";

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

function directionalFiles(
    assetRoot: string,
    folder: string,
    prefix: string,
): Record<Facing, string> {
    return {
        north: `${assetRoot}/${folder}/${prefix}_Body_000.png`,
        east: `${assetRoot}/${folder}/${prefix}_Body_090.png`,
        south: `${assetRoot}/${folder}/${prefix}_Body_180.png`,
        west: `${assetRoot}/${folder}/${prefix}_Body_270.png`,
    };
}

const ICE_GOLEM_ASSET_ROOT = "/sprites/golem";
const PANTHER_KNIGHT_ASSET_ROOT = "/sprites/panther-knight";
const ARCHER_ASSET_ROOT = "/sprites/archer";
const ARCHER_HUMAN_ASSET_ROOT = "/sprites/archerHuman";
const BLACK_KNIGHT_ASSET_ROOT = "/sprites/blackKnight";

function teamAtlas(assetRoot: string, file: string): Pick<
    Extract<MonsterSpriteAnimation, { spriteSheet: string }>,
    "spriteSheet" | "playerSpriteSheets" | "framesPerRow" | "rows"
> {
    return {
        spriteSheet:
            file === "Idle"
                ? `${assetRoot}/${file}.png`
                : `${assetRoot}/red/${file}.png`,
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
    golem: {
        frameWidth: 180,
        frameHeight: 180,
        scale: 0.4,
        previewScale: 1.15,
        tooltipVerticalPadding: 56,
        originX: 0.5,
        originY: 0.605,
        animations: {
            idle: {
                frameRate: 8,
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Idle", "Idle"),
            },
            move: {
                frameRate: 8,
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Walk", "Walk_Forward"),
            },
            attack: {
                frameRate: 15,
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Attack", "Attack"),
            },
            hit: {
                frameRate: 12,
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Hit", "Hit"),
            },
            death: {
                frameRate: 12,
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Death", "Death"),
            },
        },
    },
    knight: {
        frameWidth: 180,
        frameHeight: 180,
        scale: 0.45,
        previewScale: 1.35,
        previewOffsetY: -5,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 5,
            east: 4,
            south: 4,
            west: 3,
        },
        animations: {
            idle: {
                frameRate: 8,
                files: directionalFiles(PANTHER_KNIGHT_ASSET_ROOT, "Idle", "Idle_Stand"),
            },
            move: {
                frameRate: 12,
                files: directionalFiles(PANTHER_KNIGHT_ASSET_ROOT, "Walk", "Walk_Forward"),
            },
            attack: {
                frameRate: 12,
                files: directionalFiles(PANTHER_KNIGHT_ASSET_ROOT, "Attack", "Attack_01"),
            },
            strongAttack: {
                frameRate: 12,
                files: directionalFiles(PANTHER_KNIGHT_ASSET_ROOT, "StrongAttack", "Attack_04"),
            },
            death: {
                frameRate: 10,
                files: directionalFiles(PANTHER_KNIGHT_ASSET_ROOT, "Death", "Death_01"),
            },
        },
    },
    archerHuman: {
        frameWidth: 180,
        frameHeight: 180,
        scale: 0.4,
        previewScale: 1,
        previewOffsetY: -5,
        originX: 0.5,
        originY: 0.67,
        facingOffsetY: {
            north: 2,
            east: 2,
            south: 2,
            west: 3,
        },
        animations: {
            idle: {
                frameRate: 8,
                files: directionalFiles(ARCHER_HUMAN_ASSET_ROOT, "Idle", "Idle_Bow"),
            },
            move: {
                frameRate: 12,
                files: directionalFiles(ARCHER_HUMAN_ASSET_ROOT, "Walk", "WalkForward_Bow"),
            },
            attack: {
                frameRate: 30,
                files: directionalFiles(ARCHER_HUMAN_ASSET_ROOT, "Attack", "Attack_Bow"),
            },
            death: {
                frameRate: 10,
                files: directionalFiles(ARCHER_HUMAN_ASSET_ROOT, "Death", "Death_Bow"),
            },
        },
    },
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
            death: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Die"),
            },
            move: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "Walk"),
            },
            hit: {
                frameRate: 8,
                ...teamAtlas(BLACK_KNIGHT_ASSET_ROOT, "TakeDamage"),
            },
        },
    },
};
