import { GameSceneAttackTargeting } from "./GameSceneAttackTargeting";
import {
    resolveAttack,
    validateAttackResolution,
    type AttackResolution,
} from "../game/combatResolution";
import { isBehind } from "../game/geometry";
import { getMonsterEliminationWinner, opposingPlayer } from "../game/matchRules";
import { hasTurnBuff, isAreaAttack } from "../game/monsterActions";
import type { SupportEffectResult } from "../game/statusEffects";
import { describeAppliedTurnBuff, describeCooldownReduction } from "./game/attackLabels";
import type { MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";

export abstract class GameSceneAttackExecution extends GameSceneAttackTargeting {
    protected executeAttack(
        attacker: PlacedMonster,
        attackIndex: number,
        targetPosition: Position,
        clickedMonster: PlacedMonster | undefined,
    ): AttackResolution | undefined {
        if (!this.canAttackTarget(attacker.id, attackIndex, targetPosition)) return undefined;
        const attack = attacker.monster.attacks[attackIndex];
        const allyTarget =
            attack.targetsAlliesOnly && clickedMonster?.owner === this.currentPlayer
                ? clickedMonster
                : undefined;
        if (
            attack.targetsAlliesOnly &&
            (!allyTarget ||
                (attack.healAmount === undefined &&
                    attack.cooldownReduction === undefined &&
                    !hasTurnBuff(attack)))
        ) {
            return undefined;
        }
        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition);
        if (zone)
            validateAttackResolution(this.attackContext, attacker, attackIndex, targetPosition);
        if (
            !zone ||
            !this.spendCurrentSymbol("attack", this.getMonsterAttackCost(attacker, attack))
        ) {
            return undefined;
        }
        const isBackstab =
            clickedMonster !== undefined &&
            clickedMonster.owner !== this.currentPlayer &&
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(clickedMonster.position, attacker.position, clickedMonster.facing);
        const resolution = resolveAttack(
            this.attackContext,
            attacker,
            attackIndex,
            targetPosition,
            zone.cells,
        );
        this.monsterSpriteView.playAttack(
            attacker.id,
            attack.animation,
            isBackstab,
            resolution.attackFacing,
        );

        if (resolution.support) {
            const { target, effect } = resolution.support;
            this.recordAttack(
                attacker,
                `${target.monster.name} (J${target.owner})`,
                0,
                this.describeSupportEffect(attack, effect),
            );
        } else {
            for (const { target, damage } of resolution.hits) {
                if (damage > 0) {
                    this.monsterSpriteView.takeDamage(target.id, target.currentHp, target.position);
                }
                this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, damage);
            }
            if (resolution.baseHit) this.hitOpponentBase(attacker);
            if (!resolution.hits.length && !resolution.baseHit) {
                this.recordAttack(attacker, isAreaAttack(attack) ? "zone ciblée" : "case vide", 0);
            }
        }
        this.finishAttack();
        return resolution;
    }

    private describeSupportEffect(attack: MonsterAttack, effect: SupportEffectResult): string {
        if (effect.type === "heal") {
            return `+${effect.healed} PV${effect.clearedEffects > 0 ? ", effets dissipés" : ""}`;
        }
        if (effect.type === "cooldown") {
            return describeCooldownReduction(effect.reducedCooldowns, effect.reduction);
        }
        return describeAppliedTurnBuff(attack);
    }

    private hitOpponentBase(attacker: PlacedMonster): void {
        const opponent = opposingPlayer(this.currentPlayer);
        this.playerHealth[opponent]--;
        if (this.playerHealth[opponent] === 0) this.winner = this.currentPlayer;
        this.recordAttack(attacker, `J${opponent} (départ)`, 1);
    }

    private recordAttack(
        attacker: PlacedMonster,
        targetName: string,
        damage: number,
        effect?: string,
    ): void {
        this.recordAction({
            type: "attack",
            player: this.currentPlayer,
            attackerName: attacker.monster.name,
            targetName,
            damage,
            ...(effect === undefined ? {} : { effect }),
        });
    }

    private finishAttack(): void {
        this.winner ??= getMonsterEliminationWinner(
            this.placedMonsters,
            this.gameConfiguration.monstersKilledForVictory,
        );
        if (this.winner !== null || this.getAvailableSymbols("attack") === 0) {
            this.actionMode = { type: "idle" };
        } else if (this.actionMode.type === "attack") {
            this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        }
        this.render();
    }
}
