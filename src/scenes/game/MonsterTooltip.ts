import Phaser from "phaser";

import { GAME_CONFIG } from "../../config";
import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { MONSTER_SPRITES, type MonsterSpriteFacing } from "../../data/monsterSprites";
import { STATUS_EFFECT_COLORS } from "../../game/statusEffects";
import {
    describeMonsterAttack,
    describeMonsterMovement,
    describeMonsterStatusEffect,
    describeMonsterTraits,
    formatCost,
    formatHitPoints,
    formatMonsterArmor,
} from "../../game/monsterDescriptions";

import type {
    Facing,
    Monster,
    MonsterStatusEffect,
    PlacedMonster,
    PlayerId,
    Position,
} from "../../types/GameTypes";

interface MonsterTooltipOptions {
    readonly key: string;
    readonly monster: Monster;
    readonly hp: number;
    readonly owner: PlayerId;
    readonly attackCooldowns?: readonly number[];
    readonly statusEffects?: readonly MonsterStatusEffect[];
    readonly isCamouflaged?: boolean;
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

        const pointerPosition = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const hoveredCell = this.toGrid(pointerPosition);
        const hovered = monsters.find((monster) => {
            if (monster.currentHp <= 0) return false;

            return (
                hoveredCell.x === monster.position.x && hoveredCell.y === monster.position.y
            );
        });

        if (hovered) {
            const center = this.toScreen(hovered.position);
            this.show({
                key: `${hovered.id}:${hovered.position.x},${hovered.position.y}:${hovered.currentHp}:${hovered.attackCooldowns.join(",")}:${JSON.stringify(hovered.statusEffects)}:${hovered.isCamouflaged === true}`,
                monster: hovered.monster,
                hp: hovered.currentHp,
                owner: hovered.owner,
                attackCooldowns: hovered.attackCooldowns,
                statusEffects: hovered.statusEffects,
                isCamouflaged: hovered.isCamouflaged,
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
                x: pointerPosition.x,
                y: pointerPosition.y - 40,
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
        const {
            key,
            monster,
            hp,
            owner,
            attackCooldowns = [],
            statusEffects = [],
            isCamouflaged = false,
            x,
            y,
            alignLeft,
        } = options;
        const isNewTooltip = this.hoveredMonsterKey !== key;
        if (isNewTooltip) {
            this.container.removeAll(true);
            const attacks = monster.attacks
                .map((attack, index) => {
                    const cooldown = attackCooldowns[index] ?? 0;
                    const remainingCooldown =
                        cooldown > 0
                            ? ` — Recharge restante : ${cooldown} tour${cooldown === 1 ? "" : "s"} du joueur`
                            : "";
                    return `${describeMonsterAttack(attack)}${remainingCooldown}`;
                })
                .join("\n");
            const backstab = monster.bonusDamageFromBehind
                ? `\nBonus de dos : +${monster.bonusDamageFromBehind} dégâts`
                : "";
            const traits = describeMonsterTraits(monster).join(" · ");
            const contentWidth = Math.min(440, GAME_CONFIG.screenWidth - 128);
            const contentX = 104;
            const title = this.scene.add.text(
                contentX,
                6,
                monster.name,
                {
                    fontFamily: "Arial",
                    fontSize: "16px",
                    color: "#ffffff",
                    lineSpacing: 3,
                },
            );
            const playerLabel = this.scene.add.text(title.x + title.width + 6, 6, `J${owner}`, {
                fontFamily: "Arial",
                fontSize: "16px",
                color: owner === 1 ? "#ff8d78" : "#70bdff",
            });
            const firstLineWidth = title.width + 6 + playerLabel.width;
            const camouflageLabel =
                monster.id === "thief" && isCamouflaged
                    ? this.scene.add.text(0, 6, "Camouflé", {
                          fontFamily: "Arial",
                          fontSize: "14px",
                          color: "#90e5a4",
                      })
                    : null;
            const titleRowBottom = 6 + Math.max(title.height, playerLabel.height);
            const traitsLabel = traits
                ? this.scene.add.text(contentX, titleRowBottom + 2, traits, {
                      fontFamily: "Arial",
                      fontSize: "14px",
                      color: "#aab5c2",
                  })
                : null;
            const hpY = traitsLabel ? traitsLabel.y + traitsLabel.height + 2 : titleRowBottom + 3;
            const invocationCost = this.scene.add.text(
                contentX,
                hpY,
                formatCost(monster.cost, DICE_SYMBOL_PRESENTATION.invocation.emoji),
                {
                    fontFamily: "Arial",
                    fontSize: "16px",
                    color: "#ffffff",
                },
            );
            const currentHp = this.scene.add
                .text(
                    invocationCost.x + invocationCost.width + 8,
                    hpY,
                    formatHitPoints(hp),
                    {
                        fontFamily: "Arial",
                        fontSize: "14px",
                        color: hp < monster.hp ? "#ff5555" : "#ffffff",
                    },
                )
                .setPadding(0, 2, 4, 0);
            const hpSeparator = this.scene.add
                .text(currentHp.x + currentHp.width + 4, hpY, " / ", {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: "#ffffff",
                })
                .setPadding(0, 2, 4, 0);
            const hpTotal = this.scene.add
                .text(hpSeparator.x + hpSeparator.width, hpY, formatHitPoints(monster.hp), {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: "#ffffff",
                })
                .setPadding(0, 2, 4, 0);
            let hpRowWidth =
                invocationCost.width + 8 + currentHp.width + hpSeparator.width + hpTotal.width;
            let statusX = hpTotal.x + hpTotal.width + 8;
            const statusLabels = statusEffects.map((effect) => {
                const label = this.scene.add.text(
                    statusX,
                    hpY,
                    describeMonsterStatusEffect(effect),
                    {
                        fontFamily: "Arial",
                        fontSize: "14px",
                        color: `#${STATUS_EFFECT_COLORS[effect.color].toString(16).padStart(6, "0")}`,
                    },
                );
                statusX = label.x + label.width + 8;
                hpRowWidth = Math.max(hpRowWidth, label.x + label.width - contentX);
                return label;
            });
            const detailsY =
                hpY +
                Math.max(
                    currentHp.height,
                    hpSeparator.height,
                    hpTotal.height,
                    ...statusLabels.map((label) => label.height),
                ) +
                2;
            const armorLabel = this.scene.add.text(
                contentX,
                detailsY,
                formatMonsterArmor(monster),
                {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: "#c7d3df",
                },
            );
            const details = this.scene.add.text(
                contentX,
                armorLabel.y + armorLabel.height + 2,
                `${attacks}\n${describeMonsterMovement(monster)}${backstab}`,
                {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: "#ffffff",
                    lineSpacing: 4,
                    wordWrap: { width: contentWidth },
                },
            );
            const textWidth = Math.min(
                contentWidth,
                Math.max(
                    firstLineWidth + (camouflageLabel ? camouflageLabel.width + 8 : 0),
                    hpRowWidth,
                    traitsLabel?.width ?? 0,
                    details.width,
                ),
            );
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
            camouflageLabel?.setX(background.width - camouflageLabel.width - 12);
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
                ...(camouflageLabel ? [camouflageLabel] : []),
                invocationCost,
                ...(traitsLabel ? [traitsLabel] : []),
                currentHp,
                hpSeparator,
                hpTotal,
                ...statusLabels,
                details,
            ]);
            this.container.setSize(background.width, background.height);
            this.hoveredMonsterKey = key;
        }

        if (isNewTooltip) {
            const tooltipX = alignLeft ? x - this.container.width - 12 : x + 12;
            const view = this.scene.cameras.main.worldView;
            const minX = view.x + 4;
            const maxX = Math.max(minX, view.x + view.width - this.container.width - 4);
            const minY = view.y + 4;
            const maxY = Math.max(minY, view.y + view.height - this.container.height - 4);
            this.container.setPosition(
                Phaser.Math.Clamp(tooltipX, minX, maxX),
                Phaser.Math.Clamp(y, minY, maxY),
            );
        }
    }
}
