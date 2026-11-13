interface MainMenuProps {
    readonly onOpenPlay: () => void;
    readonly onEditDeck: () => void;
    readonly onOpenOptions: () => void;
}

export function MainMenu({ onOpenPlay, onEditDeck, onOpenOptions }: MainMenuProps) {
    return (
        <section id="menu-screen">
            <section id="main-menu" className="menu-panel">
                <div className="menu-card-grid">
                    <button className="menu-card" onClick={onOpenPlay}>
                        <span className="choice-icon" aria-hidden="true">
                            ⚔
                        </span>
                        <strong>Jouer</strong>
                    </button>
                    <button className="menu-card" onClick={onEditDeck}>
                        <svg className="choice-die-icon" viewBox="0 0 48 48" aria-hidden="true">
                            <path d="M24 4 41 13.5v21L24 44 7 34.5v-21L24 4Z" />
                            <path d="M7 13.5 24 23l17-9.5M24 23v21" />
                            <circle cx="16" cy="14" r="1.8" />
                            <circle cx="32" cy="14" r="1.8" />
                        </svg>
                        <strong>Deck</strong>
                    </button>
                    <button className="menu-card" onClick={onOpenOptions}>
                        <span className="choice-icon" aria-hidden="true">
                            ⚙
                        </span>
                        <strong>Options</strong>
                    </button>
                </div>
            </section>
        </section>
    );
}
