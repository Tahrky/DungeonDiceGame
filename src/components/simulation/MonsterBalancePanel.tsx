import { useMemo, useState } from "react";
import { MONSTERS } from "../../data/monsters";
import { MONSTER_BALANCE_OPTIONS } from "../../data/configuration";
import { analyzeMonsters } from "../../simulation/monsterBalance";
import { SelectField } from "../common/FormFields";
import { BalanceComparison } from "./BalanceComparison";
import { BALANCE_COLUMNS } from "./balanceColumns";
import { SortableTable } from "./SortableTable";

function MonsterOptions({
    monsters,
}: {
    readonly monsters: readonly { id: string; name: string }[];
}) {
    return (
        <>
            {monsters.map((monster) => (
                <option key={monster.id} value={monster.id}>
                    {monster.name}
                </option>
            ))}
        </>
    );
}

export function MonsterBalancePanel() {
    const reports = useMemo(() => analyzeMonsters(MONSTERS), []);
    const [selectedId, setSelectedId] = useState(MONSTERS[0]?.id ?? "");
    const [comparisonId, setComparisonId] = useState(
        MONSTERS.find((monster) => monster.id !== MONSTERS[0]?.id)?.id ?? "",
    );
    const selected = reports.find((report) => report.id === selectedId) ?? reports[0];
    const comparison =
        reports.find((report) => report.id === comparisonId && report.id !== selected?.id) ??
        reports.find((report) => report.id !== selected?.id);
    if (!selected || !comparison) return null;

    const selectMonster = (nextId: string): void => {
        setSelectedId(nextId);
        if (comparison.id !== nextId) return;
        const nextComparison = MONSTERS.find((monster) => monster.id !== nextId);
        if (nextComparison) setComparisonId(nextComparison.id);
    };

    return (
        <section className="simulation-analysis" aria-labelledby="monster-balance-title">
            <h3 id="monster-balance-title">Équilibrage des monstres</h3>
            <p className="simulation-description">
                Analyse calculée depuis les caractéristiques de <code>monsters.ts</code> et les
                hypothèses par défaut de l’analyseur fourni.
            </p>
            <div className="simulation-table-wrap">
                <h4>Indicateurs globaux — tous les monstres</h4>
                <SortableTable
                    rows={reports}
                    columns={BALANCE_COLUMNS}
                    getRowKey={(monster) => monster.id}
                />
            </div>
            <div className="simulation-balance-grid">
                <SelectField
                    className="simulation-balance-select"
                    label="Monstre"
                    value={selected.id}
                    onChange={selectMonster}
                >
                    <MonsterOptions monsters={MONSTERS} />
                </SelectField>
                <SelectField
                    className="simulation-balance-select"
                    label="Comparer avec"
                    value={comparison.id}
                    onChange={setComparisonId}
                >
                    <MonsterOptions
                        monsters={MONSTERS.filter((monster) => monster.id !== selected.id)}
                    />
                </SelectField>
            </div>

            <BalanceComparison first={selected} second={comparison} />
            <p className="simulation-footnote">
                Estimations basées sur un plateau {MONSTER_BALANCE_OPTIONS.boardWidth} ×{" "}
                {MONSTER_BALANCE_OPTIONS.boardHeight}, {MONSTER_BALANCE_OPTIONS.resourcesPerTurn}{" "}
                ressources par tour, {MONSTER_BALANCE_OPTIONS.enemyDensity * 100} % d’ennemis,{" "}
                {MONSTER_BALANCE_OPTIONS.allyDensity * 100} % d’alliés et un horizon de{" "}
                {MONSTER_BALANCE_OPTIONS.analysisHorizon} tours.
            </p>
        </section>
    );
}
