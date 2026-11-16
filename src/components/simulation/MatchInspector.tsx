import type { AnalyzableMatch } from "../../simulation/analysis";

interface MatchInspectorProps {
    readonly matches: readonly AnalyzableMatch[];
    readonly selectedMatchId: string;
    readonly onMatchChange: (id: string) => void;
}

export function MatchInspector({
    matches,
    selectedMatchId,
    onMatchChange,
}: MatchInspectorProps) {
    const match = matches.find((candidate) => candidate.id === Number(selectedMatchId));
    const visibleHistory = match?.history.slice(-500) ?? [];

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
                            J2 : {match.profiles[2]} · {match.statistics[2].summoned} invoqués
                        </span>
                        <span>
                            {match.winner ? `Vainqueur : J${match.winner}` : "Résultat : égalité"}
                        </span>
                    </div>
                    <div className="simulation-board-view">
                        <pre aria-label="Plateau final">{match.finalBoard.rows.join("\n")}</pre>
                        <ul>
                            {match.finalBoard.legend.map((item) => (
                                <li key={item.symbol}>
                                    <code>{item.symbol}</code> {item.meaning}
                                </li>
                            ))}
                        </ul>
                    </div>
                    {match.finalMonsters.length > 0 && (
                        <div className="simulation-table-wrap">
                            <h4>Monstres en fin de match</h4>
                            <table className="simulation-table">
                                <thead>
                                    <tr>
                                        <th>Monstre</th>
                                        <th>Joueur</th>
                                        <th>PV</th>
                                        <th>Position</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {match.finalMonsters.map((monster) => (
                                        <tr key={monster.id}>
                                            <th scope="row">{monster.name}</th>
                                            <td>J{monster.owner}</td>
                                            <td>
                                                {monster.hp}/{monster.maxHp}
                                            </td>
                                            <td>
                                                {monster.position.x}, {monster.position.y}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                        <table className="simulation-table">
                            <thead>
                                <tr>
                                    <th>Tour</th>
                                    <th>Joueur</th>
                                    <th>Type</th>
                                    <th>Action / stratégie</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleHistory.map((event, index) => (
                                    <tr key={`${event.turn}-${event.player}-${index}`}>
                                        <td>{event.turn}</td>
                                        <td>J{event.player}</td>
                                        <td>{event.type}</td>
                                        <td>{event.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
