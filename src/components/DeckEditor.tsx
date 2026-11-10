import { useState } from 'react';

import { MONSTERS } from '../data/monsters';
import {
    DECK_SIZE,
    DECK_STORAGE_KEY,
    getDefaultDeck,
    getSavedDeck,
    parseDeck,
    serializeDeck,
} from '../game/decks';

interface DeckEditorProps {
    readonly onBack: () => void;
}

export function DeckEditor({ onBack }: DeckEditorProps) {
    const [selectedDeck, setSelectedDeck] = useState(() => getSavedDeck() ?? getDefaultDeck());
    const [deckJson, setDeckJson] = useState(() => serializeDeck(selectedDeck));
    const [notice, setNotice] = useState('');

    function toggleMonster(monsterId: string): void {
        let nextDeck: string[];
        if (selectedDeck.includes(monsterId)) {
            nextDeck = selectedDeck.filter((id) => id !== monsterId);
        } else if (selectedDeck.length < DECK_SIZE) {
            nextDeck = [...selectedDeck, monsterId];
        } else {
            setNotice(`Votre deck contient déjà ${DECK_SIZE} monstres.`);
            return;
        }

        setSelectedDeck(nextDeck);
        setDeckJson(serializeDeck(nextDeck));
        setNotice('');
    }

    function saveDeck(): void {
        const validDeck = parseDeck(selectedDeck);
        if (!validDeck) {
            setNotice(`Sélectionnez exactement ${DECK_SIZE} monstres avant d’enregistrer.`);
            return;
        }
        try {
            localStorage.setItem(DECK_STORAGE_KEY, serializeDeck(validDeck));
            setNotice('Deck enregistré sur cet appareil.');
        } catch {
            setNotice('Impossible d’enregistrer le deck dans le stockage de ce navigateur.');
        }
    }

    function applyDeckJson(): void {
        let value: unknown;
        try {
            value = JSON.parse(deckJson);
        } catch {
            setNotice('JSON invalide. Vérifiez le format puis réessayez.');
            return;
        }
        const deck = parseDeck(value);
        if (!deck) {
            setNotice(
                `Le JSON doit contenir exactement ${DECK_SIZE} identifiants de monstres uniques et disponibles.`,
            );
            return;
        }
        setSelectedDeck(deck);
        setDeckJson(serializeDeck(deck));
        setNotice('Sélection chargée. Enregistrez-la pour la conserver.');
    }

    async function copyDeckJson(): Promise<void> {
        try {
            await navigator.clipboard.writeText(deckJson);
            setNotice('JSON copié dans le presse-papiers.');
        } catch {
            setNotice('Copie impossible dans ce navigateur. Sélectionnez le texte pour le copier.');
        }
    }

    return (
        <section id="menu-screen" aria-live="polite">
            <section id="deck-editor" className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour au menu
                </button>
                <p className="eyebrow">VOTRE ARMÉE</p>
                <h2>Choisissez 5 monstres ({selectedDeck.length}/{DECK_SIZE})</h2>
                <p className="panel-description">
                    Votre sélection est sauvegardée sur cet appareil. Sans deck enregistré, les cinq
                    monstres les moins chers sont utilisés.
                </p>
                <div className="monster-list">
                    {MONSTERS.map((monster) => {
                        const selected = selectedDeck.includes(monster.id);
                        return (
                            <button
                                key={monster.id}
                                type="button"
                                className={`monster-card${selected ? ' selected' : ''}`}
                                aria-pressed={selected}
                                onClick={() => toggleMonster(monster.id)}
                            >
                                <span
                                    className="monster-symbol"
                                    style={{
                                        color: `#${monster.color.toString(16).padStart(6, '0')}`,
                                    }}
                                >
                                    {monster.symbol}
                                </span>
                                <span>
                                    <strong>{monster.name}</strong>
                                    <small>
                                        Coût {monster.cost} · {monster.hp} PV
                                    </small>
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="deck-json">
                    <label htmlFor="deck-json">Code JSON de votre sélection</label>
                    <textarea
                        id="deck-json"
                        spellCheck={false}
                        aria-describedby="deck-json-help"
                        value={deckJson}
                        onChange={(event) => setDeckJson(event.target.value)}
                    />
                    <small id="deck-json-help">
                        Copiez ce code ou collez un deck de cinq identifiants de monstres.
                    </small>
                    <div className="deck-actions">
                        <button className="secondary-button" onClick={applyDeckJson}>
                            Charger ce JSON
                        </button>
                        <button className="secondary-button" onClick={copyDeckJson}>
                            Copier le JSON
                        </button>
                        <button className="primary-button" onClick={saveDeck}>
                            Enregistrer mon deck
                        </button>
                    </div>
                    <output className="notice" aria-live="polite">
                        {notice}
                    </output>
                </div>
            </section>
        </section>
    );
}
