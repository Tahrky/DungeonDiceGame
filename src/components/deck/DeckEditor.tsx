import { useState } from "react";

import {
    DECK_STORAGE_KEY,
    getDefaultDeck,
    getRandomDeck,
    getSavedDeck,
    parseDeck,
    serializeDeck,
} from "../../game/decks";
import { getSavedGameConfiguration } from "../../game/gameConfiguration";
import { MenuScreen } from "../common/MenuScreen";
import { Notice } from "../common/Notice";
import { useUnsavedChangesGuard } from "../common/useUnsavedChangesGuard";
import { MonsterCard } from "./MonsterCard";
import { MonsterInfoTooltip, useMonsterTooltip } from "./MonsterInfoTooltip";

interface DeckEditorProps {
    readonly onBack: () => void;
    readonly deckSize: number;
}

export function DeckEditor({ onBack, deckSize }: DeckEditorProps) {
    const [savedDeck, setSavedDeck] = useState(
        () => getSavedDeck(deckSize) ?? getDefaultDeck(deckSize),
    );
    const [selectedDeck, setSelectedDeck] = useState(savedDeck);
    const [monsters] = useState(() => getSavedGameConfiguration().monsters);
    const [deckJson, setDeckJson] = useState(() => serializeDeck(selectedDeck));
    const [notice, setNotice] = useState("");
    const { tooltip, show: showMonsterInfo, hide: hideMonsterInfo } = useMonsterTooltip();
    const isDirty =
        serializeDeck(selectedDeck) !== serializeDeck(savedDeck) ||
        deckJson !== serializeDeck(selectedDeck);

    function replaceDeck(deck: string[], message: string): void {
        setSelectedDeck(deck);
        setDeckJson(serializeDeck(deck));
        setNotice(message);
    }

    function toggleMonster(monsterId: string): void {
        if (selectedDeck.includes(monsterId)) {
            replaceDeck(
                selectedDeck.filter((id) => id !== monsterId),
                "",
            );
        } else if (selectedDeck.length < deckSize) {
            replaceDeck([...selectedDeck, monsterId], "");
        } else {
            setNotice(`Votre deck contient déjà ${deckSize} monstres.`);
        }
    }

    function applyDeckJson(): void {
        let value: unknown;
        try {
            value = JSON.parse(deckJson);
        } catch {
            setNotice("JSON invalide. Vérifiez le format puis réessayez.");
            return;
        }
        const deck = parseDeck(value, deckSize);
        if (deck) {
            replaceDeck(deck, "Sélection chargée. Enregistrez-la pour la conserver.");
        } else {
            setNotice(
                `Le JSON doit contenir exactement ${deckSize} identifiants de monstres uniques et disponibles.`,
            );
        }
    }

    async function copyDeckJson(): Promise<void> {
        try {
            await navigator.clipboard.writeText(deckJson);
            setNotice("JSON copié dans le presse-papiers.");
        } catch {
            setNotice("Copie impossible dans ce navigateur. Sélectionnez le texte pour le copier.");
        }
    }

    function saveDeck(): boolean {
        const validDeck =
            deckJson === serializeDeck(selectedDeck) ? parseDeck(selectedDeck, deckSize) : null;
        if (!validDeck) {
            setNotice(`Sélectionnez exactement ${deckSize} monstres avant d’enregistrer.`);
            return false;
        }
        try {
            localStorage.setItem(DECK_STORAGE_KEY, serializeDeck(validDeck));
        } catch {
            setNotice("Impossible d’enregistrer le deck dans le stockage de ce navigateur.");
            return false;
        }
        setSavedDeck(validDeck);
        replaceDeck(validDeck, "Deck enregistré sur cet appareil.");
        return true;
    }

    const { requestBack, dialog } = useUnsavedChangesGuard(isDirty, onBack, saveDeck);

    return (
        <MenuScreen
            panelId="deck-editor"
            isLive
            backLabel="Retour au menu"
            onBack={requestBack}
            eyebrow="VOTRE ARMÉE"
            title={`Choisissez ${deckSize} monstres (${selectedDeck.length}/${deckSize})`}
            description={`Votre sélection est sauvegardée sur cet appareil. Sans deck enregistré, les${deckSize} monstres les moins chers sont utilisés.`}
            dialog={dialog}
        >
            <div className="monster-list">
                {monsters.map((monster) => (
                    <MonsterCard
                        key={monster.id}
                        monster={monster}
                        selected={selectedDeck.includes(monster.id)}
                        onToggle={toggleMonster}
                        onShowInfo={showMonsterInfo}
                        onHideInfo={hideMonsterInfo}
                    />
                ))}
            </div>
            {tooltip && <MonsterInfoTooltip {...tooltip} />}
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
                    <button
                        className="secondary-button"
                        onClick={() =>
                            replaceDeck(
                                getRandomDeck(deckSize),
                                "Deck aléatoire généré. Enregistrez-le pour le conserver.",
                            )
                        }
                    >
                        Générer un deck aléatoire
                    </button>
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
                <Notice aria-live="polite">{notice}</Notice>
            </div>
        </MenuScreen>
    );
}
