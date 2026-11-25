import type Phaser from "phaser";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import type { ButtonOptions } from "./hudTypes";

const HUD_EDGE_MARGIN = 12;

export const PATTERN_COLUMNS = 4;
export const PATTERN_CARD_WIDTH = 122;
export const PATTERN_CARD_HEIGHT = 44;
export const PATTERN_COLUMN_GAP = 128;
export const PATTERN_ROW_GAP = 48;

const PATTERN_GRID_WIDTH =
    PATTERN_COLUMNS * PATTERN_CARD_WIDTH +
    (PATTERN_COLUMNS - 1) * (PATTERN_COLUMN_GAP - PATTERN_CARD_WIDTH);
const PATTERN_ROW_COUNT = Math.ceil((PLACEMENT_PATTERNS.length + 1) / PATTERN_COLUMNS);

export const PATTERN_GRID_HEIGHT = PATTERN_CARD_HEIGHT + (PATTERN_ROW_COUNT - 1) * PATTERN_ROW_GAP;

export const HUD_BUTTON_WIDTH = 190;
export const HUD_BUTTON_HEIGHT = 40;

export const INVOCATION_PANEL_WIDTH = 200;
export const INVOCATION_ROW_HEIGHT = 40;
export const INVOCATION_ROW_GAP = 44;
export const INVOCATION_BUTTON_Y = 12;
export const INVOCATION_BUTTON_GAP = 8;

export const WIDE_BUTTON_OPTIONS: ButtonOptions = {
    rightAligned: true,
    uniformSize: true,
    centerVertically: true,
    fontSize: 18,
    width: INVOCATION_PANEL_WIDTH,
};

export const ACTION_LOG_TOP_OFFSET = 136;
export const ACTION_LOG_WIDTH = 195;
export const ACTION_LOG_HEIGHT = 410;
export const ACTION_LOG_TOGGLE_WIDTH = 40;
export const ACTION_LOG_TRACK_OFFSET_X = ACTION_LOG_WIDTH - 10;
export const ACTION_LOG_TRACK_HEIGHT = ACTION_LOG_HEIGHT - 68;
export const ACTION_LOG_THUMB_MIN_HEIGHT = 24;
export const ACTION_LOG_VISIBLE_COUNT = 6;

export function getHudTopY(scene: Phaser.Scene, offset: number): number {
    return scene.cameras.main.getWorldPoint(0, offset).y;
}

export function getHudBottomY(scene: Phaser.Scene, offset: number): number {
    return scene.cameras.main.getWorldPoint(0, scene.scale.height - offset).y;
}

export function getHudLeftX(scene: Phaser.Scene): number {
    return scene.cameras.main.getWorldPoint(HUD_EDGE_MARGIN, 0).x;
}

export function getHudRightX(scene: Phaser.Scene): number {
    return scene.cameras.main.getWorldPoint(scene.scale.width - HUD_EDGE_MARGIN, 0).x;
}

export function getPatternStartX(scene: Phaser.Scene): number {
    return getHudRightX(scene) - PATTERN_GRID_WIDTH;
}
