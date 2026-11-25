import type Phaser from "phaser";

import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import {
    describeMonsterStatusEffect,
    formatCost,
    formatHitPoints,
    formatMonsterArmor,
} from "../../game/monsterDescriptions";
import { STATUS_EFFECT_COLORS } from "../../game/statusEffects";
import type { Monster, MonsterStatusEffect } from "../../types/GameTypes";
import { arialStyle } from "./uiStyle";

export type Text = Phaser.GameObjects.Text;

export const CONTENT_X = 104;
export const WHITE = "#ffffff";

export function addTooltipText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    size: number,
    color: string,
    extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Text {
    return scene.add.text(x, y, label, arialStyle(size, color, extra));
}

function addHitPointText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    color: string,
): Text {
    return addTooltipText(scene, x, y, label, 14, color).setPadding(0, 2, 4, 0);
}

export function addHitPointRow(
    scene: Phaser.Scene,
    monster: Monster,
    hp: number,
    statusEffects: readonly MonsterStatusEffect[],
    y: number,
): { cost: Text; labels: Text[]; width: number } {
    const cost = addTooltipText(
        scene,
        CONTENT_X,
        y,
        formatCost(monster.cost, DICE_SYMBOL_PRESENTATION.invocation.emoji),
        16,
        WHITE,
    );
    const currentHp = addHitPointText(
        scene,
        cost.x + cost.width + 8,
        y,
        formatHitPoints(hp),
        hp < monster.hp ? "#ff5555" : WHITE,
    );
    const separator = addHitPointText(scene, currentHp.x + currentHp.width + 4, y, " / ", WHITE);
    const total = addHitPointText(
        scene,
        separator.x + separator.width,
        y,
        formatHitPoints(monster.hp),
        WHITE,
    );
    const armor = addHitPointText(
        scene,
        total.x + total.width,
        y,
        ` · ${formatMonsterArmor(monster)}`,
        WHITE,
    );
    let width = armor.x + armor.width - CONTENT_X;
    let statusX = armor.x + armor.width + 8;
    const statusLabels = statusEffects.map((effect) => {
        const color = STATUS_EFFECT_COLORS[effect.color].toString(16).padStart(6, "0");
        const label = addTooltipText(
            scene,
            statusX,
            y,
            describeMonsterStatusEffect(effect),
            14,
            `#${color}`,
        );
        statusX = label.x + label.width + 8;
        width = Math.max(width, label.x + label.width - CONTENT_X);
        return label;
    });
    return { cost, labels: [currentHp, separator, total, armor, ...statusLabels], width };
}
