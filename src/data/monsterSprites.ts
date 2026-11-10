import type { Facing } from "../types/GameTypes";

export type MonsterSpriteAction = "idle" | "move" | "attack" | "strongAttack" | "hit" | "death";

export interface MonsterSpriteAnimation {
    readonly frameRate: number;
    readonly files: Readonly<Record<Facing, string>>;
}

export interface MonsterSpriteDefinition {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly scale: number;
    readonly previewScale?: number;
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
                files: directionalFiles(ICE_GOLEM_ASSET_ROOT, "Attack_01", "Attack_01"),
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
};
