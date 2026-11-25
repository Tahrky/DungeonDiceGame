import type { MonsterAttackUsage } from "../../simulation/analysis";
import { AttackUsageList } from "./AttackUsageList";
import type { SortableColumn } from "./SortableTable";

interface NamedMonster {
    readonly name: string;
}

interface AttackingMonster extends NamedMonster {
    readonly attacks: number;
    readonly totalDamage: number;
    readonly attackUsage: readonly MonsterAttackUsage[];
}

export function nameColumn<Row extends NamedMonster>(): SortableColumn<Row> {
    return { key: "name", label: "Monstre", getValue: (monster) => monster.name, rowHeader: true };
}

export function attacksColumn<Row extends AttackingMonster>(): SortableColumn<Row> {
    return {
        key: "attacks",
        label: "Attaques",
        getValue: (monster) => monster.attacks,
        render: (monster) => (monster.attacks > 0 ? monster.attacks : ""),
    };
}

export function totalDamageColumn<Row extends AttackingMonster>(
    label: string,
): SortableColumn<Row> {
    return {
        key: "totalDamage",
        label,
        getValue: (monster) => monster.totalDamage,
        render: (monster) => (monster.totalDamage > 0 ? monster.totalDamage : ""),
    };
}

export function attackUsageColumn<Row extends AttackingMonster>(): SortableColumn<Row> {
    return {
        key: "attackUsage",
        label: "Attaques les plus utilisées",
        getValue: (monster) =>
            monster.attackUsage.reduce((total, attack) => total + attack.uses, 0),
        render: (monster) => <AttackUsageList attacks={monster.attackUsage} />,
    };
}
