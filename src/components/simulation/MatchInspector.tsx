import {
    analyzeMatchMonsters,
    type AnalyzableMatch,
    type MatchMonsterAnalysis,
} from "../../simulation/analysis";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../../game/monsterSymbols";
import type { SimulationEvent } from "../../simulation/types";
import { AttackUsageList } from "./AttackUsageList";
import { SortableTable, type SortableColumn } from "./SortableTable";
import { SimulationBoard } from "./SimulationBoard";

interface MatchHistoryEntry {
    event: SimulationEvent;
    index: number;
}

interface MatchInspectorProps {
    readonly matches: readonly AnalyzableMatch[];
    readonly configuration: GameConfiguration;
    readonly selectedMatchId: string;
    readonly onMatchChange: (id: string) => void;
}

export function MatchInspector({
    matches,
    configuration,
    selectedMatchId,
    onMatchChange,
}: MatchInspectorProps) {
    const match = matches.find((candidate) => candidate.id === Number(selectedMatchId));
    const visibleHistory = match?.history.slice(-500) ?? [];
    const monsterStats = match ? analyzeMatchMonsters(match) : [];
    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    const monsterColumns: SortableColumn<MatchMonsterAnalysis>[] = [
        {
            key: "symbol",
            label: "Symbole",
            getValue: (monster) =>
                monster.symbol ?? getMonsterSymbol(monsterSymbols, monster.monsterId),
        },
        { key: "name", label: "Monstre", getValue: (monster) => monster.name, rowHeader: true },
        {
            key: "owner",
            label: "Joueur",
            getValue: (monster) => monster.owner,
            render: (monster) => (
                <span
                    className={`simulation-player-label simulation-player-label--${monster.owner}`}
                >
                    J{monster.owner}
                </span>
            ),
        },
        {
            key: "hp",
            label: "PV",
            getValue: (monster) => monster.hp,
            render: (monster) =>
                monster.hp <= 0 ? (
                    "Mort"
                ) : (
                    <>
                        {monster.hp < monster.maxHp ? (
                            <span className="simulation-damaged-hp">{monster.hp}</span>
                        ) : (
                            monster.hp
                        )}
                        /{monster.maxHp}
                    </>
                ),
        },
        {
            key: "position",
            label: "Position",
            getValue: (monster) => `${monster.position.x}, ${monster.position.y}`,
            render: (monster) => `${monster.position.x}, ${monster.position.y}`,
        },
        {
            key: "attacks",
            label: "Attaques",
            getValue: (monster) => monster.attacks,
            render: (monster) => (monster.attacks > 0 ? monster.attacks : ""),
        },
        {
            key: "totalDamage",
            label: "Dégâts infligés",
            getValue: (monster) => monster.totalDamage,
            render: (monster) => (monster.totalDamage > 0 ? monster.totalDamage : ""),
        },
        {
            key: "attackUsage",
            label: "Attaques les plus utilisées",
            getValue: (monster) =>
                monster.attackUsage.reduce((total, attack) => total + attack.uses, 0),
            render: (monster) => <AttackUsageList attacks={monster.attackUsage} />,
        },
    ];
    const historyRows = visibleHistory.map((event, index) => ({ event, index }));
    const historyColumns: SortableColumn<MatchHistoryEntry>[] = [
        { key: "turn", label: "Tour", getValue: ({ event }) => event.turn },
        { key: "player", label: "Joueur", getValue: ({ event }) => event.player },
        { key: "type", label: "Type", getValue: ({ event }) => event.type },
        {
            key: "description",
            label: "Action / stratégie",
            getValue: ({ event }) => event.description,
        },
    ];

    return (
        <section className="simulation-match-inspector">
            <div className="simulation-inspector-heading">
                <div>
                    <h4>Plateau et historique d’un match</h4>
                    <p className="simulation-description">
                        Sélectionnez un match pour consulter son état final et ses actions.
                    </p>
                </div>
                <label className="settings-field">
                    Match
                    <select
                        value={selectedMatchId}
                        onChange={(event) => onMatchChange(event.currentTarget.value)}
                    >
                        {matches.map((item) => (
                            <option key={item.id} value={item.id}>
                                #{item.id} · {item.turns} tours ·{" "}
                                {item.winner ? `J${item.winner} gagne` : "égalité"}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {match && (
                <>
                    <div className="simulation-board-summary">
                        <span>
                            J1 : {match.profiles[1]} · {match.statistics[1].summoned} invoqués
                        </span>
                        <span>
                            Dernière invocation J1 :{" "}
                            {formatLastSummonTurn(match.statistics[1].lastMonsterSummonTurn)}
                        </span>
                        <span>
                            J2 : {match.profiles[2]} · {match.statistics[2].summoned} invoqués
                        </span>
                        <span>
                            Dernière invocation J2 :{" "}
                            {formatLastSummonTurn(match.statistics[2].lastMonsterSummonTurn)}
                        </span>
                        <span>
                            {match.winner ? `Vainqueur : J${match.winner}` : "Résultat : égalité"}
                        </span>
                    </div>
                    <SimulationBoard match={match} configuration={configuration} />
                    {match.finalMonsters.length > 0 && (
                        <div className="simulation-table-wrap">
                            <h4>Monstres en fin de match</h4>
                            <SortableTable
                                rows={monsterStats}
                                columns={monsterColumns}
                                getRowKey={(monster) => monster.id}
                            />
                        </div>
                    )}
                    <div className="simulation-history">
                        <h4>Historique du match</h4>
                        {match.history.length > visibleHistory.length && (
                            <p className="simulation-description">
                                Les 500 événements les plus récents sont affichés. Le JSON conserve
                                l’historique complet.
                            </p>
                        )}
                        <SortableTable
                            rows={historyRows}
                            columns={historyColumns}
                            getRowKey={({ event, index }) =>
                                `${event.turn}-${event.player}-${index}`
                            }
                        />
                    </div>
                </>
            )}
        </section>
    );
}

function formatLastSummonTurn(turn: number | null | undefined): string {
    if (turn === undefined) return "non renseignée";
    return turn === null ? "limite non atteinte" : `tour ${turn}`;
}
