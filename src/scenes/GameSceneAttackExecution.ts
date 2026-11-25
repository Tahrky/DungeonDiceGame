import { GameSceneAttackTargeting } from "./GameSceneAttackTargeting";
import { isAttackCellInRange } from "../game/attackRules";
import { getFacingFromMovement, isBehind, isSamePosition } from "../game/geometry";
import { getMonsterEliminationWinner, opposingPlayer } from "../game/matchRules";
import {
    applyMonsterTurnBuff,
    canAttackMonster,
    getBuffedAttackDamage,
    hasTurnBuff,
    isAreaAttack,
    reduceAttackCooldowns,
    registerAttackUse,
} from "../game/monsterActions";
import { clearStatusEffects, healMonster } from "../game/statusEffects";
import { describeAppliedTurnBuff, describeCooldownReduction } from "./game/attackLabels";
import type { MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";

export abstract class GameSceneAttackExecution extends GameSceneAttackTargeting {
    protected executeAttack(
        attacker: PlacedMonster,
        attackIndex: number,
        targetPosition: Position,
        clickedMonster: PlacedMonster | undefined,
    ): void {
        if (!this.canAttackTarget(attacker.id, attackIndex, targetPosition)) return;
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
            return;
        }
        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition);
        const damage = getBuffedAttackDamage(attacker, attack);
        if (
            !zone ||
            !this.spendCurrentSymbol("attack", this.getMonsterAttackCost(attacker, attack))
        ) {
            return;
        }
        registerAttackUse(attacker, attackIndex, targetPosition);
        const isBackstab =
            clickedMonster !== undefined &&
            clickedMonster.owner !== this.currentPlayer &&
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(clickedMonster.position, attacker.position, clickedMonster.facing);
        this.monsterSpriteView.playAttack(
            attacker.id,
            attack.animation,
            isBackstab,
            attacker.facing,
        );

        if (allyTarget) {
            this.executeAllyTargetedAttack(attacker, attack, allyTarget);
        } else if (isAreaAttack(attack)) {
            this.executeAreaAttack(attacker, attack, zone.cells, damage);
        } else {
            const backstabBonus = isBackstab ? (attacker.monster.bonusDamageFromBehind ?? 0) : 0;
            this.executeSingleTargetAttack(
                attacker,
                attack,
                targetPosition,
                clickedMonster,
                damage + backstabBonus,
            );
        }
    }

    private executeAllyTargetedAttack(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        target: PlacedMonster,
    ): void {
        const effect = this.applySupportEffect(attack, target);
        if (effect === undefined) return;
        this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, 0, effect);
        this.finishAttack();
    }

    private applySupportEffect(attack: MonsterAttack, target: PlacedMonster): string | undefined {
        if (attack.healAmount !== undefined) {
            const { healed, clearedEffects } = healMonster(
                target,
                attack.healAmount,
                attack.clearsStatusEffects,
            );
            return `+${healed} PV${clearedEffects > 0 ? ", effets dissipés" : ""}`;
        }
        if (attack.cooldownReduction !== undefined) {
            if (attack.clearsStatusEffects) clearStatusEffects(target);
            const reducedCooldowns = reduceAttackCooldowns(target, attack.cooldownReduction);
            return describeCooldownReduction(reducedCooldowns, attack.cooldownReduction);
        }
        if (!hasTurnBuff(attack)) return undefined;
        applyMonsterTurnBuff(target, attack);
        return describeAppliedTurnBuff(attack);
    }

    private executeAreaAttack(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        zone: readonly Position[],
        damage: number,
    ): void {
        const hitCells = zone.filter((cell) =>
            isAttackCellInRange(attacker.position, attack, cell),
        );
        if (attack.movesToZone) {
            const landing = this.getSlimeLanding(attacker, attack, zone);
            if (landing) {
                attacker.facing = getFacingFromMovement(
                    attacker.position,
                    landing,
                    attacker.facing,
                );
                attacker.position = { ...landing };
            }
        }

        let hitSomething = false;
        for (const monster of this.placedMonsters) {
            if (
                monster.currentHp > 0 &&
                monster.id !== attacker.id &&
                hitCells.some((cell) => isSamePosition(cell, monster.position)) &&
                (attack.hitsAllies || monster.owner !== this.currentPlayer) &&
                canAttackMonster(attacker.monster, attack, monster.monster)
            ) {
                if (monster.isCamouflaged) monster.isCamouflaged = false;
                this.hitMonster(attacker, attack, monster, damage);
                hitSomething = true;
            }
        }
        if (
            this.canAttackBase(attacker) &&
            hitCells.some((cell) => this.isOpponentStartingPosition(cell))
        ) {
            this.hitOpponentBase(attacker);
            hitSomething = true;
        }
        if (!hitSomething) this.recordAttack(attacker, "zone ciblée", 0);
        this.finishAttack();
    }

    private executeSingleTargetAttack(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        targetPosition: Position,
        target: PlacedMonster | undefined,
        damage: number,
    ): void {
        if (target) {
            if (target.owner === this.currentPlayer) return;
            this.hitMonster(attacker, attack, target, damage);
        } else if (this.isOpponentStartingPosition(targetPosition)) {
            this.hitOpponentBase(attacker);
        } else {
            this.recordAttack(attacker, "case vide", 0);
        }
        this.finishAttack();
    }

    private hitMonster(
        attacker: PlacedMonster,
        attack: MonsterAttack,
        target: PlacedMonster,
        damage: number,
    ): void {
        target.currentHp -= damage;
        if (target.currentHp <= 0 && attacker.monster.id === "thief") {
            attacker.isCamouflaged = true;
        }
        this.applyAttackStatusEffect(target, attack);
        if (damage > 0) {
            this.monsterSpriteView.takeDamage(target.id, target.currentHp, target.position);
        }
        this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, damage);
    }

    private hitOpponentBase(attacker: PlacedMonster): void {
        const opponent = opposingPlayer(this.currentPlayer);
        this.playerHealth[opponent]--;
        if (this.playerHealth[opponent] === 0) this.winner = this.currentPlayer;
        this.recordAttack(attacker, `J${opponent} (départ)`, 1);
    }

    private applyAttackStatusEffect(
        target: PlacedMonster,
        { statusEffect: effect, clearsStatusEffects }: MonsterAttack,
    ): void {
        if (target.currentHp <= 0) {
            clearStatusEffects(target);
            return;
        }
        if (clearsStatusEffects) clearStatusEffects(target);
        if (!effect) return;
        target.statusEffects = [
            ...target.statusEffects.filter((status) => status.type !== effect.type),
            { ...effect, remainingTurns: effect.duration },
        ];
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
