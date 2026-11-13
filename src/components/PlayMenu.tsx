interface PlayMenuProps {
    readonly canPlay: boolean;
    readonly showOnlineOptions: boolean;
    readonly onBack: () => void;
    readonly onPlay: () => void;
    readonly onLocalPlay: () => void;
    readonly onOnline: () => void;
}

export function PlayMenu({
    canPlay,
    showOnlineOptions,
    onBack,
    onPlay,
    onLocalPlay,
    onOnline,
}: PlayMenuProps) {
    return (
        <section id="menu-screen" aria-live="polite">
            <section className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour à l’accueil
                </button>
                <h2>Jouer</h2>
                <div className={`menu-card-grid${showOnlineOptions ? "" : " menu-card-grid--two"}`}>
                    <button className="menu-card" onClick={onPlay} disabled={!canPlay}>
                        <svg className="choice-monitor-icon" viewBox="0 0 48 48" aria-hidden="true">
                            <rect x="5" y="7" width="38" height="27" rx="2" />
                            <path d="M18 41h12m-6-7v7" />
                            <path d="M10 12h28v17H10z" className="monitor-screen" />
                        </svg>
                        <strong>Ordinateur</strong>
                    </button>
                    <button className="menu-card" onClick={onLocalPlay} disabled={!canPlay}>
                        <span className="choice-icon" aria-hidden="true">
                            ⚔
                        </span>
                        <strong>Local</strong>
                    </button>
                    {showOnlineOptions && (
                        <button className="menu-card" onClick={onOnline}>
                            <span className="choice-icon" aria-hidden="true">
                                ⌂
                            </span>
                            <strong>En ligne</strong>
                        </button>
                    )}
                </div>
            </section>
        </section>
    );
}
