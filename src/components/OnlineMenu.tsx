interface OnlineMenuProps {
    readonly onBack: () => void;
    readonly onCreateRoom: () => void;
    readonly onJoinRoom: () => void;
}

export function OnlineMenu({ onBack, onCreateRoom, onJoinRoom }: OnlineMenuProps) {
    return (
        <section id="menu-screen" aria-live="polite">
            <section className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour aux modes de jeu
                </button>
                <h2>En ligne</h2>
                <div className="menu-card-grid menu-card-grid--two">
                    <button className="menu-card" onClick={onCreateRoom}>
                        <span className="choice-icon" aria-hidden="true">
                            ⌂
                        </span>
                        <strong>Créer une salle</strong>
                    </button>
                    <button className="menu-card" onClick={onJoinRoom}>
                        <span className="choice-icon" aria-hidden="true">
                            ↗
                        </span>
                        <strong>Rejoindre une salle</strong>
                    </button>
                </div>
            </section>
        </section>
    );
}
