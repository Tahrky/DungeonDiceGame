import Phaser from "phaser";

import { GAME_CONFIG } from "../config";
import type { MonsterSpriteAction } from "../data/monsterSprites";
import { BoardView } from "./game/BoardView";
import { GameHud } from "./game/GameHud";
import { MonsterTooltip } from "./game/MonsterTooltip";
import { MonsterSpriteView } from "./game/MonsterSpriteView";
import { GameSceneComputer } from "./GameSceneComputer";

const IDLE_ACTIONS: readonly MonsterSpriteAction[] = ["idle"];
const OTHER_ACTIONS: readonly MonsterSpriteAction[] = [
    "move",
    "attack",
    "alternativeAttack1",
    "alternativeAttack2",
    "backstab",
    "hit",
    "death",
];

export abstract class GameSceneInitialization extends GameSceneComputer {
    private loadingOverlay: Phaser.GameObjects.Container | null = null;
    private loadingMessage: Phaser.GameObjects.Text | null = null;
    private activeSpriteLoadCleanup: (() => void) | null = null;

    create(): void {
        if (!this.hasGameSetup) return;

        this.cameras.main.setBackgroundColor("#202a36");
        this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
            this.activeSpriteLoadCleanup?.();
            if (this.load.isLoading()) this.load.reset();
            this.hideLoadingOverlay();
        });
        this.boardGraphics = this.add.graphics();
        this.uiContainer = this.add.container(0, 0).setDepth(2);
        this.tooltipContainer = this.add.container(0, 0).setDepth(10);

        this.boardView = new BoardView(this, this.boardGraphics, this.board, (position) =>
            this.gridToScreen(position),
        );
        this.monsterSpriteView = new MonsterSpriteView(this, (position) =>
            this.gridToScreen(position),
        );
        this.gameHud = new GameHud(this, this.uiContainer);
        this.monsterTooltip = new MonsterTooltip(
            this,
            this.tooltipContainer,
            (position) => this.gridToScreen(position),
            (position) => this.boardView.worldToGrid(position),
            (monster, facing, container, x, y, spriteFacingOverride) =>
                this.monsterSpriteView.createPreview(
                    monster,
                    facing,
                    container,
                    x,
                    y,
                    spriteFacingOverride,
                ),
        );

        this.setCamera(this.scale.gameSize);
        this.render();
        this.showLoadingOverlay();
        const monsterIds = [...new Set([...this.playerDecks[1], ...this.playerDecks[2]])];
        this.time.delayedCall(0, () => this.loadInitialSprites(monsterIds));
        this.bindInput();
        this.game.events.on("remote-game-command", this.handleRemoteCommand, this);
        this.game.events.on("remote-game-state", this.applyRemoteSnapshot, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off("remote-game-command", this.handleRemoteCommand, this);
            this.game.events.off("remote-game-state", this.applyRemoteSnapshot, this);
        });
    }

    protected abstract bindInput(): void;
    protected abstract handleRemoteCommand(value: unknown): void;

    private resizeCamera(gameSize: { width: number; height: number }): void {
        if (!this.setCamera(gameSize)) return;
        if (this.gameHud) this.gameHud.render(this.viewState, this.hudActions);
    }

    private setCamera(gameSize: { width: number; height: number }): boolean {
        if (gameSize.width <= 0 || gameSize.height <= 0) return false;

        const zoom = Math.min(
            gameSize.width / GAME_CONFIG.screenWidth,
            gameSize.height / GAME_CONFIG.screenHeight,
        );
        const camera = this.cameras.main;
        camera.setZoom(zoom);
        camera.centerOn(GAME_CONFIG.screenWidth / 2, GAME_CONFIG.screenHeight / 2);
        camera.preRender();
        return true;
    }

    private showLoadingOverlay(): void {
        const { screenWidth, screenHeight } = GAME_CONFIG;
        const blocker = this.add
            .rectangle(0, 0, screenWidth, screenHeight, 0x080d14, 0.62)
            .setOrigin(0)
            .setInteractive();
        const panel = this.add
            .rectangle(screenWidth / 2, screenHeight / 2, 430, 112, 0x263340, 1)
            .setStrokeStyle(1, 0xf0c974);
        const title = this.add
            .text(screenWidth / 2, screenHeight / 2 - 20, "Préparation de la partie", {
                color: "#f0c974",
                fontFamily: "Arial",
                fontSize: "22px",
                fontStyle: "bold",
            })
            .setOrigin(0.5);
        this.loadingMessage = this.add
            .text(
                screenWidth / 2,
                screenHeight / 2 + 20,
                "Chargement des sprites essentiels… 0 %",
                {
                    color: "#ffffff",
                    fontFamily: "Arial",
                    fontSize: "15px",
                },
            )
            .setOrigin(0.5);
        this.loadingOverlay = this.add
            .container(0, 0, [blocker, panel, title, this.loadingMessage])
            .setDepth(100);
    }

    private loadInitialSprites(monsterIds: readonly string[]): void {
        this.loadSpriteAssets(monsterIds, IDLE_ACTIONS, true, (failedFiles) => {
            this.monsterSpriteView.createAnimations(monsterIds, IDLE_ACTIONS);
            this.monsterSpriteView.setReady();
            this.assetsReady = true;
            if (this.pendingResumeSnapshot) {
                this.applySnapshot(this.pendingResumeSnapshot);
                this.pendingResumeSnapshot = null;
            }
            this.render();
            if (this.computerOpponent && this.currentPlayer === 2 && this.winner === null) {
                this.computerTurnInProgress = true;
                this.time.delayedCall(450, () => this.playComputerTurn());
            }

            if (failedFiles.length > 0) {
                console.error("Échec du chargement de sprites :", failedFiles);
                this.loadingMessage?.setText(
                    `${failedFiles.length} ressource(s) indisponible(s) ; la partie reste jouable.`,
                );
                this.time.delayedCall(2400, () => this.hideLoadingOverlay());
            } else {
                this.hideLoadingOverlay();
            }

            this.time.delayedCall(0, () => this.loadRemainingSprites(monsterIds));
        });
    }

    private loadRemainingSprites(monsterIds: readonly string[]): void {
        this.loadSpriteAssets(monsterIds, OTHER_ACTIONS, false, (failedFiles) => {
            this.monsterSpriteView.createAnimations(monsterIds, OTHER_ACTIONS);
            this.monsterSpriteView.refreshCurrentAnimations();
            if (failedFiles.length > 0) {
                console.error("Échec du chargement des animations :", failedFiles);
            }
        });
    }

    private loadSpriteAssets(
        monsterIds: readonly string[],
        actions: readonly MonsterSpriteAction[],
        trackProgress: boolean,
        onComplete: (failedFiles: string[]) => void,
    ): void {
        const failedFiles: string[] = [];
        const handleLoadError = (file: Phaser.Loader.File): void => {
            failedFiles.push(file.key);
        };
        const handleProgress = (progress: number): void => {
            this.loadingMessage?.setText(
                `Chargement des sprites essentiels… ${Math.round(progress * 100)} %`,
            );
        };
        const handleComplete = (): void => {
            cleanup();
            onComplete(failedFiles);
        };
        const cleanup = (): void => {
            this.load.off(Phaser.Loader.Events.COMPLETE, handleComplete);
            this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
            this.load.off(Phaser.Loader.Events.PROGRESS, handleProgress);
            if (this.activeSpriteLoadCleanup === cleanup) {
                this.activeSpriteLoadCleanup = null;
            }
        };

        this.activeSpriteLoadCleanup?.();
        this.activeSpriteLoadCleanup = cleanup;
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
        if (trackProgress) this.load.on(Phaser.Loader.Events.PROGRESS, handleProgress);
        const queuedFiles = MonsterSpriteView.preload(this, monsterIds, actions);
        if (queuedFiles === 0) {
            handleComplete();
            return;
        }

        this.load.once(Phaser.Loader.Events.COMPLETE, handleComplete);
        this.load.start();
    }

    private hideLoadingOverlay(): void {
        this.loadingOverlay?.destroy(true);
        this.loadingOverlay = null;
        this.loadingMessage = null;
    }
}
