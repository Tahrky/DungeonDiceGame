import type { MonsterAnalysis } from "../../simulation/analysis";
import { attackUsageColumn, attacksColumn, nameColumn, totalDamageColumn } from "./monsterColumns";
import type { SortableColumn } from "./SortableTable";

function getResourceTotal(monster: MonsterAnalysis): number | null {
    if (monster.resourceCosts === null) return null;
    return Object.values(monster.resourceCosts).reduce((total, cost) => total + cost, 0);
}

const ACTION_COLUMNS: SortableColumn<MonsterAnalysis>[] = [
    attacksColumn(),
    totalDamageColumn("Dégâts totaux"),
    { key: "directDamage", label: "Dégâts directs", getValue: (monster) => monster.directDamage },
    {
        key: "damageOverTime",
        label: "Dégâts différés",
        headerTitle: "Dégâts enregistrés par les événements de statut, comme le poison.",
        getValue: (monster) => monster.damageOverTime,
    },
    {
        key: "attacksWithDamage",
        label: "Attaques avec dégâts",
        headerTitle: "Attaques ayant infligé au moins un dégât selon l’historique.",
        getValue: (monster) => monster.attacksWithDamage,
    },
    {
        key: "kills",
        label: "Éliminations",
        headerTitle: "Éliminations identifiées dans la cible de l’événement d’attaque.",
        getValue: (monster) => monster.kills,
    },
    {
        key: "averageFirstInvocationTurn",
        label: "Tour moyen de 1re invocation",
        getValue: (monster) => monster.averageFirstInvocationTurn,
        render: (monster) => monster.averageFirstInvocationTurn?.toFixed(1) ?? "–",
    },
    {
        key: "resourceCosts",
        label: "Ressources dépensées",
        headerTitle: "Coûts réellement présents dans les événements du rapport.",
        getValue: getResourceTotal,
        render: (monster) => getResourceTotal(monster) ?? "Indisponible",
    },
    { key: "movements", label: "Déplacements cumulés", getValue: (monster) => monster.movements },
    {
        key: "averageMovements",
        label: "Déplacements moyens / invocation",
        getValue: (monster) => monster.averageMovements,
        render: (monster) => monster.averageMovements.toFixed(2),
    },
    attackUsageColumn(),
];

export function getAnalysisMonsterColumns(
    totalMatches: number,
    includeActionDetails: boolean,
): SortableColumn<MonsterAnalysis>[] {
    const columns: SortableColumn<MonsterAnalysis>[] = [
        nameColumn(),
        { key: "appearances", label: "Invocations", getValue: (monster) => monster.appearances },
        {
            key: "matchesSeen",
            label: "Matchs avec apparition",
            getValue: (monster) => monster.matchesSeen,
            render: (monster) =>
                totalMatches > 0
                    ? `${((monster.matchesSeen / totalMatches) * 100).toFixed(1)} %`
                    : "",
        },
    ];
    return includeActionDetails ? [...columns, ...ACTION_COLUMNS] : columns;
}
