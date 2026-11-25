import Phaser from "phaser";

import { GAME_CONFIG } from "../../config";
import { MONSTER_SPRITES } from "../../data/monsterSprites";
import { getBoardOrigin, isBoardCell, type BoardDefinition } from "../../game/boards";
import { FACING_VECTORS } from "../../game/geometry";
import type { PlacedMonster, PlayerId, Position } from "../../types/GameTypes";

import type { GameViewState } from "./GameViewState";
import { adjustColor, toGrayscale } from "./boardColors";
import {
    createCellRenderContext,
    getCellStyle,
    type BoardActions,
    type CellRenderContext,
    type CellStyle,
} from "./boardCellStyle";
import { arialStyle } from "./uiStyle";

const MARKER_COLORS: Record<PlayerId, { fill: number; outline: number }> = {
    1: { fill: 0xff6655, outline: 0x000000 },
    2: { fill: 0x55aaff, outline: 0xffffff },
};

const ELEVATED_FACE_TONE = 0.52;
const ELEVATED_OUTLINE_COLOR = 0x30363a;

function shade(state: GameViewState, color: number): number {
    return state.winner === null ? color : toGrayscale(color);
}

export class BoardView {
    private readonly scene: Phaser.Scene;
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly board: BoardDefinition;
    private readonly toScreen: (position: Position) => Position;

    constructor(
        scene: Phaser.Scene,
        graphics: Phaser.GameObjects.Graphics,
        board: BoardDefinition,
        toScreen: (position: Position) => Position,
    ) {
        this.scene = scene;
        this.graphics = graphics;
        this.board = board;
        this.toScreen = toScreen;
        if (GAME_CONFIG.showDirectionLabels) this.drawDirectionLabels();
    }

    worldToGrid(position: Position): Position {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        const origin = getBoardOrigin(this.board);
        const dx = position.x - origin.x;
        const dy = position.y - origin.y;

        return {
            x: Math.round(dx / tileWidth + dy / tileHeight),
            y: Math.round(-dx / tileWidth + dy / tileHeight),
        };
    }

    isInsideBoard(position: Position): boolean {
        return isBoardCell(this.board, position);
    }

    isPointerOverBoard(position: Position): boolean {
        const cell = this.worldToGrid(position);
        if (!this.isInsideBoard(cell)) return false;

        const center = this.toScreen(cell);
        const { tileWidth, tileHeight } = GAME_CONFIG;
        return (
            Math.abs(position.x - center.x) / (tileWidth / 2) +
                Math.abs(position.y - center.y) / (tileHeight / 2) <=
            1
        );
    }

    draw(state: GameViewState, actions: BoardActions): void {
        this.graphics.clear();
        const context = createCellRenderContext(state, actions);

        for (let y = 0; y < this.board.height; y++) {
            for (let x = 0; x < this.board.width; x++) {
                if (isBoardCell(this.board, { x, y })) this.drawCell({ x, y }, context);
            }
        }

        this.drawElevatedCells(state, context);
        this.drawStartingPositions(state);
        this.drawFallbackMonsters(state);
    }

    private drawCell(cell: Position, context: CellRenderContext): void {
        const { state } = context;
        const style = getCellStyle(cell, context);
        this.drawPolygon(
            this.getDiamondPoints(this.toScreen(cell)),
            shade(state, style.color),
            style.fillAlpha,
            { width: 1.5, color: shade(state, 0x35443a), alpha: 0.9 },
        );
    }

    private drawElevatedCells(state: GameViewState, context: CellRenderContext): void {
        const obstacles = [...state.obstacles].sort(
            (first, second) =>
                first.position.x + first.position.y - second.position.x - second.position.y,
        );
        for (const { position, height } of obstacles) {
            const center = this.toScreen(position);
            if (height === -1) {
                this.graphics.fillStyle(0x151b22, 1);
                this.graphics.fillPoints(this.getDiamondPoints(center), true);
            } else {
                this.drawRaisedCell(center, getCellStyle(position, context), state);
            }
        }
    }

    private drawRaisedCell(center: Position, style: CellStyle, state: GameViewState): void {
        const base = this.getDiamondPoints(center);
        const top = this.getDiamondPoints({
            x: center.x,
            y: center.y - GAME_CONFIG.tileHeight * 0.45,
        });
        const color = shade(state, style.color);
        const faceLine = { width: 1.25, color: ELEVATED_OUTLINE_COLOR, alpha: 1 };

        this.drawPolygon(
            [top[2], top[3], base[3], base[2]],
            adjustColor(color, ELEVATED_FACE_TONE),
            1,
            faceLine,
        );
        this.drawPolygon(
            [top[1], top[2], base[2], base[1]],
            adjustColor(color, ELEVATED_FACE_TONE * 0.78),
            1,
            faceLine,
        );
        this.drawPolygon(top, adjustColor(color, 1.22), style.fillAlpha, {
            width: 1.75,
            color: shade(state, ELEVATED_OUTLINE_COLOR),
            alpha: 1,
        });
    }

    private drawPolygon(
        points: Phaser.Math.Vector2[],
        fillColor: number,
        fillAlpha: number,
        line: { width: number; color: number; alpha: number },
    ): void {
        this.graphics.fillStyle(fillColor, fillAlpha);
        this.graphics.lineStyle(line.width, line.color, line.alpha);
        this.graphics.fillPoints(points, true);
        this.graphics.strokePoints(points, true);
    }

    private getDiamondPoints(center: Position): Phaser.Math.Vector2[] {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        return [
            new Phaser.Math.Vector2(center.x, center.y - tileHeight / 2),
            new Phaser.Math.Vector2(center.x + tileWidth / 2, center.y),
            new Phaser.Math.Vector2(center.x, center.y + tileHeight / 2),
            new Phaser.Math.Vector2(center.x - tileWidth / 2, center.y),
        ];
    }

    private drawDirectionLabels(): void {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        const lastColumn = this.board.width - 1;
        const lastRow = this.board.height - 1;
        const labels = [
            { text: "N", cell: { x: 0, y: 0 }, offsetX: 0, offsetY: -(tileHeight / 2 + 14) },
            { text: "E", cell: { x: lastColumn, y: 0 }, offsetX: tileWidth / 2 + 14, offsetY: 0 },
            {
                text: "S",
                cell: { x: lastColumn, y: lastRow },
                offsetX: 0,
                offsetY: tileHeight / 2 + 14,
            },
            { text: "O", cell: { x: 0, y: lastRow }, offsetX: -(tileWidth / 2 + 14), offsetY: 0 },
        ];

        for (const { text, cell, offsetX, offsetY } of labels) {
            const position = this.toScreen(cell);
            this.scene.add
                .text(
                    position.x + offsetX,
                    position.y + offsetY,
                    text,
                    arialStyle(16, "#f1cf65", {
                        fontStyle: "bold",
                        stroke: "#202a36",
                        strokeThickness: 4,
                    }),
                )
                .setOrigin(0.5)
                .setDepth(2);
        }
    }

    private drawStartingPositions(state: GameViewState): void {
        for (const player of [1, 2] as const) {
            const center = this.toScreen(state.startingPositions[player]);
            const { fill, outline } = MARKER_COLORS[player];
            this.graphics.fillStyle(shade(state, fill), 1);
            this.graphics.fillCircle(center.x, center.y, 10);
            this.graphics.lineStyle(2.5, shade(state, outline), 1);
            this.graphics.strokeCircle(center.x, center.y, 10);
        }
    }

    private drawFallbackMonsters(state: GameViewState): void {
        for (const placed of state.placedMonsters) {
            if (placed.currentHp > 0 && !MONSTER_SPRITES[placed.monster.id]) {
                this.drawFallbackMonster(placed, state);
            }
        }
    }

    private drawFallbackMonster(placed: PlacedMonster, state: GameViewState): void {
        const center = this.toScreen(placed.position);
        const bodyColor = placed.isCamouflaged
            ? toGrayscale(placed.monster.color)
            : shade(state, placed.monster.color);
        this.graphics.fillStyle(bodyColor, placed.isCamouflaged ? 0.7 : 1);
        this.graphics.fillCircle(center.x, center.y - 3, 8);
        const outlineColor = shade(state, MARKER_COLORS[placed.owner].outline);
        this.graphics.lineStyle(2, outlineColor, 1);
        this.graphics.strokeCircle(center.x, center.y - 3, 8);

        const facing = FACING_VECTORS[placed.facing];
        const facingPoint = this.toScreen({
            x: placed.position.x + facing.x,
            y: placed.position.y + facing.y,
        });
        const directionLength = Phaser.Math.Distance.Between(
            center.x,
            center.y,
            facingPoint.x,
            facingPoint.y,
        );
        const markerX = center.x + ((facingPoint.x - center.x) / directionLength) * 11;
        const markerY = center.y + ((facingPoint.y - center.y) / directionLength) * 11;
        this.graphics.lineStyle(2.5, outlineColor, 1);
        this.graphics.lineBetween(center.x, center.y - 3, markerX, markerY - 3);
    }
}
