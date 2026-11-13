interface OptionsMenuProps {
    readonly onBack: () => void;
    readonly onConfigureRules: () => void;
    readonly onConfigureMonsters: () => void;
}

export function OptionsMenu({ onBack, onConfigureRules, onConfigureMonsters }: OptionsMenuProps) {
    return (
        <section id="menu-screen" aria-live="polite">
            <section className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour à l’accueil
                </button>
                <h2>Options</h2>
                <div className="menu-card-grid menu-card-grid--two">
                    <button className="menu-card" onClick={onConfigureRules}>
                        <span className="choice-icon" aria-hidden="true">
                            ⚙
                        </span>
                        <strong>Règles</strong>
                    </button>
                    <button className="menu-card" onClick={onConfigureMonsters}>
                        <svg className="choice-book-icon" viewBox="0 0 48 48" aria-hidden="true">
                            <path d="M24 13c-5-4-10-4-17-3v26c7-1 12 0 17 4 5-4 10-5 17-4V10c-7-1-12-1-17 3Z" />
                            <path d="M24 13v27M7 16c7-1 12 0 17 4m17-4c-7-1-12 0-17 4" />
                        </svg>
                        <strong>
                            Configuration
                            <br />
                            monstres
                        </strong>
                    </button>
                </div>
            </section>
        </section>
    );
}
