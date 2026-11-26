import Phaser from "phaser";

import { GAME_CONFIG } from "../../data/configuration";
import { MONSTER_SPRITES, type MonsterSpriteFacing } from "../../data/monsterSprites";
import { isSamePosition } from "../../game/geometry";
import {
    describeMonsterAttack,
    describeMonsterMovement,
    describeMonsterTraits,
} from "../../game/monsterDescriptions";

import type {
    Facing,
    Monster,
    MonsterStatusEffect,
    PlacedMonster,
    PlayerId,
    Position,
} from "../../types/GameTypes";
import { addHitPointRow, addTooltipText, CONTENT_X, WHITE } from "./monsterTooltipText";
import { PLAYER_COLORS } from "./uiStyle";

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

const TOP_Y = 6;

function getMonsterKey(monster: PlacedMonster): string {
    const { id, position, currentHp, attackCooldowns, statusEffects, isCamouflaged } = monster;
    return `${id}:${position.x},${position.y}:${currentHp}:${attackCooldowns.join(",")}:${JSON.stringify(statusEffects)}:${isCamouflaged === true}`;
}

function describeAttacks(monster: Monster, attackCooldowns: readonly number[]): string {
    return monster.attacks
        .map((attack, index) => {
            const cooldown = attackCooldowns[index] ?? 0;
            const remainingCooldown =
                cooldown > 0
                    ? ` — Recharge restante : ${cooldown} tour${cooldown === 1 ? "" : "s"} du joueur`
                    : "";
            return `${describeMonsterAttack(attack)}${remainingCooldown}`;
        })
        .join("\n");
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
        const hovered = monsters.find(
            (monster) => monster.currentHp > 0 && isSamePosition(hoveredCell, monster.position),
        );

        if (hovered) {
            const center = this.toScreen(hovered.position);
            this.show({
                key: getMonsterKey(hovered),
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
        } else if (invocationMonster) {
            this.show({
                key: `invocation:${invocationMonster.id}`,
                monster: invocationMonster,
                hp: invocationMonster.hp,
                owner: currentPlayer,
                x: pointerPosition.x,
                y: pointerPosition.y - 40,
                alignLeft: true,
            });
        } else {
            this.hide();
        }
    }

    private hide(): void {
        this.container.removeAll(true);
        this.hoveredMonsterKey = null;
    }

    private show(options: MonsterTooltipOptions): void {
        if (this.hoveredMonsterKey === options.key) return;

        this.container.removeAll(true);
        this.buildContent(options);
        this.hoveredMonsterKey = options.key;

        const { x, y, alignLeft } = options;
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

    private buildContent(options: MonsterTooltipOptions): void {
        const {
            monster,
            hp,
            owner,
            attackCooldowns = [],
            statusEffects = [],
            isCamouflaged = false,
        } = options;
        const contentWidth = Math.min(440, GAME_CONFIG.screenWidth - 128);

        const title = addTooltipText(this.scene, CONTENT_X, TOP_Y, monster.name, 16, WHITE, {
            lineSpacing: 3,
        });
        const playerLabel = addTooltipText(
            this.scene,
            title.x + title.width + 6,
            TOP_Y,
            `J${owner}`,
            16,
            PLAYER_COLORS[owner].css,
        );
        const camouflageLabel =
            monster.id === "thief" && isCamouflaged
                ? addTooltipText(this.scene, 0, TOP_Y, "Camouflé", 14, "#90e5a4")
                : null;
        const titleRowBottom = TOP_Y + Math.max(title.height, playerLabel.height);
        const traits = describeMonsterTraits(monster).join(" · ");
        const traitsLabel = traits
            ? addTooltipText(this.scene, CONTENT_X, titleRowBottom + 2, traits, 14, "#aab5c2")
            : null;
        const hpY = traitsLabel ? traitsLabel.y + traitsLabel.height + 2 : titleRowBottom + 3;
        const hitPoints = addHitPointRow(this.scene, monster, hp, statusEffects, hpY);

        const detailsY = hpY + Math.max(...hitPoints.labels.map((label) => label.height)) + 2;
        const backstab = monster.bonusDamageFromBehind
            ? `\nBonus de dos : +${monster.bonusDamageFromBehind} dégâts`
            : "";
        const details = addTooltipText(
            this.scene,
            CONTENT_X,
            detailsY,
            `${describeAttacks(monster, attackCooldowns)}\n${describeMonsterMovement(monster)}${backstab}`,
            15,
            WHITE,
            { lineSpacing: 4, wordWrap: { width: contentWidth } },
        );

        const firstLineWidth = title.width + 6 + playerLabel.width;
        const textWidth = Math.min(
            contentWidth,
            Math.max(
                firstLineWidth + (camouflageLabel ? camouflageLabel.width + 8 : 0),
                hitPoints.width,
                traitsLabel?.width ?? 0,
                details.width,
            ),
        );
        const sprite = MONSTER_SPRITES[monster.id];
        const background = this.scene.add
            .rectangle(
                0,
                0,
                CONTENT_X + textWidth + 16,
                details.y + details.height + (sprite?.tooltipVerticalPadding ?? 32),
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
            52 + (sprite?.previewOffsetX ?? 0),
            background.height / 2 + (sprite?.previewOffsetY ?? 0),
            "south",
        );
        this.container.add([
            title,
            playerLabel,
            ...(camouflageLabel ? [camouflageLabel] : []),
            hitPoints.cost,
            ...(traitsLabel ? [traitsLabel] : []),
            ...hitPoints.labels,
            details,
        ]);
        this.container.setSize(background.width, background.height);
    }
}
