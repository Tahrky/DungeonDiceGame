interface MainMenuProps {
    readonly canPlay: boolean;
    readonly onPlay: () => void;
    readonly onCreateRoom: () => void;
    readonly onEditDeck: () => void;
}

export function MainMenu({ canPlay, onPlay, onCreateRoom, onEditDeck }: MainMenuProps) {
    return (
        <section id="menu-screen" aria-live="polite">
            <section id="main-menu" className="menu-panel">
                <p className="eyebrow">LE DONJON VOUS ATTEND</p>
                <h2>Comment voulez-vous jouer&nbsp;?</h2>
                <div className="menu-choices">
                    <button className="menu-choice" onClick={onPlay} disabled={!canPlay}>
                        <span className="choice-icon" aria-hidden="true">
                            ⚔
                        </span>
                        <span>
                            <strong>Jouer contre l’ordinateur</strong>
                            <small>Une partie en solo avec votre deck.</small>
                        </span>
                        <span className="choice-arrow" aria-hidden="true">
                            →
                        </span>
                    </button>
                    <button className="menu-choice" onClick={onCreateRoom}>
                        <span className="choice-icon" aria-hidden="true">
                            ⌂
                        </span>
                        <span>
                            <strong>Créer ou rejoindre une salle</strong>
                            <small>Créez un code ou saisissez celui de votre adversaire.</small>
                        </span>
                        <span className="choice-arrow" aria-hidden="true">
                            →
                        </span>
                    </button>
                    <button className="menu-choice" onClick={onEditDeck}>
                        <span className="choice-icon" aria-hidden="true">
                            ▦
                        </span>
                        <span>
                            <strong>Fabriquer mon deck</strong>
                            <small>Choisissez cinq monstres et exportez leur JSON.</small>
                        </span>
                        <span className="choice-arrow" aria-hidden="true">
                            →
                        </span>
                    </button>
                </div>
                <output className="notice" aria-live="polite" />
            </section>
        </section>
    );
}
