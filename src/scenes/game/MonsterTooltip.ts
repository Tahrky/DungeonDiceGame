import Phaser from "phaser";

import { GAME_CONFIG } from "../../config";
import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { MONSTER_SPRITES, type MonsterSpriteFacing } from "../../data/monsterSprites";
import {
    describeMonsterAttack,
    describeMonsterMovement,
} from "../../game/monsterDescriptions";

import type {
    Facing,
    Monster,
    PlacedMonster,
    PlayerId,
    Position,
} from "../../types/GameTypes";

interface MonsterTooltipOptions {
    readonly key: string;
    readonly monster: Monster;
    readonly hp: number;
    readonly owner: PlayerId;
    readonly x: number;
    readonly y: number;
    readonly alignLeft: boolean;
}

export class MonsterTooltip {
    private hoveredMonsterKey: string | null = null;
    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private readonly toScreen: (position: Position) => Position;
    private readonly toGrid: (position: Position) => Position;
    private readonly createMonsterPreview: (
        monster: Monster,
        facing: Facing,
        container: Phaser.GameObjects.Container,
        x: number,
        y: number,
        spriteFacingOverride?: MonsterSpriteFacing,
    ) => Phaser.GameObjects.GameObject;

    constructor(
        scene: Phaser.Scene,
        container: Phaser.GameObjects.Container,
        toScreen: (position: Position) => Position,
        toGrid: (position: Position) => Position,
        createMonsterPreview: MonsterTooltip["createMonsterPreview"],
    ) {
        this.scene = scene;
        this.container = container;
        this.toScreen = toScreen;
        this.toGrid = toGrid;
        this.createMonsterPreview = createMonsterPreview;
    }

    update(
        pointer: Phaser.Input.Pointer,
        monsters: readonly PlacedMonster[],
        invocationMonster: Monster | null = null,
        currentPlayer: PlayerId = 1,
        enabled = true,
    ): void {
        if (!enabled) {
            this.hide();
            return;
        }

        const hoveredCell = this.toGrid({ x: pointer.x, y: pointer.y });
        const hovered = monsters.find((monster) => {
            if (monster.currentHp <= 0) return false;

            return (
                hoveredCell.x === monster.position.x && hoveredCell.y === monster.position.y
            );
        });

        if (hovered) {
            const center = this.toScreen(hovered.position);
            this.show({
                key: `${hovered.id}:${hovered.position.x},${hovered.position.y}:${hovered.currentHp}`,
                monster: hovered.monster,
                hp: hovered.currentHp,
                owner: hovered.owner,
                x: center.x,
                y: center.y - 40,
                alignLeft: false,
            });
            return;
        }

        if (invocationMonster) {
            this.show({
                key: `invocation:${invocationMonster.id}`,
                monster: invocationMonster,
                hp: invocationMonster.hp,
                owner: currentPlayer,
                x: pointer.x,
                y: pointer.y - 40,
                alignLeft: true,
            });
            return;
        }

        this.hide();
    }

    private hide(): void {
        this.container.removeAll(true);
        this.hoveredMonsterKey = null;
    }

    private show(options: MonsterTooltipOptions): void {
        const { key, monster, hp, owner, x, y, alignLeft } = options;
        const isNewTooltip = this.hoveredMonsterKey !== key;
        if (isNewTooltip) {
            this.container.removeAll(true);
            const attacks = monster.attacks.map(describeMonsterAttack).join("\n");
            const backstab = monster.bonusDamageFromBehind
                ? `\nBonus de dos : +${monster.bonusDamageFromBehind} dégâts`
                : "";
            const contentWidth = Math.min(400, GAME_CONFIG.screenWidth - 128);
            const contentX = 104;
            const title = this.scene.add.text(
                contentX,
                6,
                `${monster.name}${monster.flying ? " (volant)" : ""}`,
                {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: "#ffffff",
                    lineSpacing: 3,
                },
            );
            const playerLabel = this.scene.add.text(title.x + title.width + 6, 6, `J${owner}`, {
                fontFamily: "Arial",
                fontSize: "15px",
                color: owner === 1 ? "#ff8d78" : "#70bdff",
            });
            const invocationCost = this.scene.add.text(
                0,
                6,
                `${monster.cost} ${DICE_SYMBOL_PRESENTATION.invocation.emoji}`,
                {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: "#ffffff",
                },
            );
            const firstLineWidth = title.width + 6 + playerLabel.width + 12 + invocationCost.width;
            invocationCost.setX(contentX + firstLineWidth - invocationCost.width);

            const hpY = 6 + Math.max(title.height, playerLabel.height, invocationCost.height) + 3;
            const hpLabel = this.scene.add
                .text(contentX, hpY, "PV : ", {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: "#ffffff",
                })
                .setPadding(0, 2, 4, 0);
            const currentHp = this.scene.add
                .text(contentX + hpLabel.width, hpY, `${hp}`, {
                    fontFamily: "Arial",
                    fontSize: "13px",
                    color: hp < monster.hp ? "#ff5555" : "#ffffff",
                })
                .setPadding(0, 2, 4, 0);
            const hpTotal = this.scene.add
                .text(currentHp.x + currentHp.width, hpY, ` / ${monster.hp}`, {
                    fontFamily: "Arial",
                    fontSize: "13px",
                    color: "#ffffff",
                })
                .setPadding(0, 2, 4, 0);
            const hpRowWidth = hpLabel.width + currentHp.width + hpTotal.width;
            const detailsY = hpY + Math.max(hpLabel.height, currentHp.height, hpTotal.height) + 2;
            const details = this.scene.add.text(
                contentX,
                detailsY,
                `${attacks}\n${describeMonsterMovement(monster)}${backstab}`,
                {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: "#ffffff",
                    lineSpacing: 4,
                    wordWrap: { width: contentWidth },
                },
            );
            const textWidth = Math.min(
                contentWidth,
                Math.max(firstLineWidth, hpRowWidth, details.width),
            );
            invocationCost.setX(contentX + textWidth - invocationCost.width);
            const width = contentX + textWidth;
            const tooltipVerticalPadding =
                MONSTER_SPRITES[monster.id]?.tooltipVerticalPadding ?? 32;
            const previewOffsetX = MONSTER_SPRITES[monster.id]?.previewOffsetX ?? 0;
            const previewOffsetY = MONSTER_SPRITES[monster.id]?.previewOffsetY ?? 0;
            const background = this.scene.add
                .rectangle(
                    0,
                    0,
                    width + 16,
                    details.y + details.height + tooltipVerticalPadding,
                    0x151b25,
                    0.95,
                )
                .setOrigin(0)
                .setStrokeStyle(1, monster.color);
            this.container.add(background);
            this.createMonsterPreview(
                monster,
                "south",
                this.container,
                52 + previewOffsetX,
                background.height / 2 + previewOffsetY,
                "south",
            );
            this.container.add([
                title,
                playerLabel,
                invocationCost,
                hpLabel,
                currentHp,
                hpTotal,
                details,
            ]);
            this.container.setSize(background.width, background.height);
            this.hoveredMonsterKey = key;
        }

        if (isNewTooltip) {
            const tooltipX = alignLeft ? x - this.container.width - 12 : x + 12;
            this.container.setPosition(
                Phaser.Math.Clamp(tooltipX, 4, GAME_CONFIG.screenWidth - this.container.width - 4),
                Phaser.Math.Clamp(y, 4, GAME_CONFIG.screenHeight - this.container.height - 4),
            );
        }
    }

}
