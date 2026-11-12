import { useState, type CSSProperties } from 'react';

import { MONSTER_SPRITES } from '../data/monsterSprites';
import {
    DECK_SIZE,
    DECK_STORAGE_KEY,
    getDefaultDeck,
    getSavedDeck,
    parseDeck,
    serializeDeck,
} from '../game/decks';
import { getSavedGameConfiguration } from '../game/gameConfiguration';
import { describeMonsterAttack, describeMonsterMovement } from '../game/monsterDescriptions';

import type { Monster } from '../types/GameTypes';
interface DeckEditorProps {
    readonly onBack: () => void;
}

function MonsterIdlePreview({ monster }: { readonly monster: Monster }) {
    const spriteDefinition = MONSTER_SPRITES[monster.id];
    const idleAnimation = spriteDefinition?.animations.idle;
    if (!idleAnimation || !('spriteSheet' in idleAnimation)) {
        return (
            <span
                className="monster-symbol"
                style={{ color: `#${monster.color.toString(16).padStart(6, '0')}` }}
            >
                {monster.symbol}
            </span>
        );
    }

    const frameSize = 216;
    const frameWidth = spriteDefinition.frameWidth;
    const frameHeight = spriteDefinition.frameHeight;
    const spriteCropLeft = 38;
    const spriteCropTop = 43;
    const spriteCropHeight = 56;
    const frameCount = idleAnimation.framesPerRow;
    const style: CSSProperties & {
        '--monster-sprite-south-x': string;
        '--monster-sprite-south-y': string;
        '--monster-sprite-last-frame-x': string;
    } = {
        backgroundImage: `url("${idleAnimation.spriteSheet}")`,
        backgroundSize: `${frameSize * frameCount}px ${frameSize * Object.keys(idleAnimation.rows).length}px`,
        animation: `monster-idle-south ${frameCount / idleAnimation.frameRate}s steps(${frameCount - 1}) infinite`,
        width: `${(frameSize * (frameWidth - spriteCropLeft)) / frameWidth}px`,
        height: `${(frameSize * spriteCropHeight) / frameHeight}px`,
        '--monster-sprite-south-x': `${-(frameSize * spriteCropLeft) / frameWidth}px`,
        '--monster-sprite-south-y': `${-frameSize * (2 + spriteCropTop / frameHeight)}px`,
        '--monster-sprite-last-frame-x': `${-frameSize * (frameCount - 1 + spriteCropLeft / frameWidth)}px`,
    };

    return (
        <span
            className="monster-info-sprite"
            role="img"
            aria-label={`${monster.name} au repos`}
            style={style}
        />
    );
}

export function DeckEditor({ onBack }: DeckEditorProps) {
    const [selectedDeck, setSelectedDeck] = useState(() => getSavedDeck() ?? getDefaultDeck());
    const [monsters] = useState(() => getSavedGameConfiguration().monsters);
    const [deckJson, setDeckJson] = useState(() => serializeDeck(selectedDeck));
    const [notice, setNotice] = useState('');
    const [hoveredMonster, setHoveredMonster] = useState<{
        monster: Monster;
        left: number;
        top: number;
    } | null>(null);

    function showMonsterInfo(monster: Monster, element: HTMLButtonElement): void {
        const bounds = element.getBoundingClientRect();
        const tooltipWidth = Math.min(360, window.innerWidth - 24);
        const tooltipHeight = Math.min(380, window.innerHeight - 24);
        const showOnRight = bounds.right + tooltipWidth + 12 <= window.innerWidth;
        const left = showOnRight
            ? bounds.right + 12
            : Math.max(12, bounds.left - tooltipWidth - 12);
        const top = Math.max(12, Math.min(bounds.top, window.innerHeight - tooltipHeight - 12));
        setHoveredMonster({ monster, left, top });
    }

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
                    {monsters.map((monster) => {
                        const selected = selectedDeck.includes(monster.id);
                        return (
                            <button
                                key={monster.id}
                                type="button"
                                className={`monster-card${selected ? ' selected' : ''}`}
                                aria-pressed={selected}
                                onClick={() => toggleMonster(monster.id)}
                                onPointerEnter={(event) =>
                                    showMonsterInfo(monster, event.currentTarget)
                                }
                                onPointerLeave={() => setHoveredMonster(null)}
                                onFocus={(event) => showMonsterInfo(monster, event.currentTarget)}
                                onBlur={() => setHoveredMonster(null)}
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
                {hoveredMonster && (
                    <aside
                        className="monster-info-tooltip"
                        role="tooltip"
                        style={{ left: hoveredMonster.left, top: hoveredMonster.top }}
                    >
                        <div className="monster-info-heading">
                            <MonsterIdlePreview monster={hoveredMonster.monster} />
                            <div>
                                <strong>{hoveredMonster.monster.name}</strong>
                                {hoveredMonster.monster.flying && <small>Volant</small>}
                            </div>
                        </div>
                        <p>
                            Invocation : {hoveredMonster.monster.cost} · PV :{' '}
                            {hoveredMonster.monster.hp}
                        </p>
                        <div className="monster-info-attacks">
                            {hoveredMonster.monster.attacks.map((attack) => (
                                <p key={`${hoveredMonster.monster.id}-${attack.name}`}>
                                    {describeMonsterAttack(attack)}
                                </p>
                            ))}
                        </div>
                        <p>{describeMonsterMovement(hoveredMonster.monster)}</p>
                        {hoveredMonster.monster.bonusDamageFromBehind !== undefined && (
                            <p>
                                Bonus de dos : +{hoveredMonster.monster.bonusDamageFromBehind}{' '}
                                dégâts
                            </p>
                        )}
                    </aside>
                )}
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
