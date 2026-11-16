import { GameSceneAttackTargeting } from "./GameSceneAttackTargeting";
import { getAvailableSymbolCount } from "../game/diceResources";
import { getMonsterEliminationWinner } from "../game/matchRules";
import { canAttackMonster, getFacingFromMovement, isBehind } from "../game/monsterActions";

import type {
    Monster,
    PlayerId,
    PlacedMonster,
    Position,
    StatusEffectDefinition,
} from "../types/GameTypes";

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
                (attack.healAmount === undefined && attack.cooldownReduction === undefined))
        ) {
            return;
        }
        const zone = this.getAttackZoneForTarget(attacker, attack, targetPosition);
        if (!zone || !this.spendCurrentSymbol("attack", attack.cost)) return;
        const attackFacing = getFacingFromMovement(
            attacker.position,
            targetPosition,
            attacker.facing,
        );
        attacker.facing = attackFacing;
        attacker.attacksUsedThisTurn++;
        attacker.attackUsesThisTurn[attackIndex] =
            (attacker.attackUsesThisTurn[attackIndex] ?? 0) + 1;
        if (attack.cooldownTurns !== undefined) {
            attacker.attackCooldowns[attackIndex] = attack.cooldownTurns;
        }
        const isBackstab =
            clickedMonster !== undefined &&
            clickedMonster.owner !== this.currentPlayer &&
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(clickedMonster.position, attacker.position, clickedMonster.facing);
        this.monsterSpriteView.playAttack(attacker.id, attack.animation, isBackstab, attackFacing);

        if (attack.targetsAlliesOnly) {
            if (allyTarget) this.executeAllyTargetedAttack(attacker, attack, allyTarget);
            return;
        }

        if (
            attack.hitsAllies ||
            attack.movesToZone ||
            attack.pattern.type === "directionalArea" ||
            attack.pattern.type === "selfRadius"
        ) {
            this.executeAreaAttack(attacker, attack, zone.cells);
            return;
        }

        this.executeSingleTargetAttack(
            attacker,
            attack,
            targetPosition,
            clickedMonster,
            isBackstab,
        );
    }

    protected executeAllyTargetedAttack(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        target: PlacedMonster,
    ): void {
        let effect: string;
        if (attack.healAmount !== undefined) {
            const healed = Math.min(
                attack.healAmount,
                Math.max(0, target.monster.hp - target.currentHp),
            );
            target.currentHp += healed;
            effect = `+${healed} PV`;
        } else if (attack.cooldownReduction !== undefined) {
            const cooldownReduction = attack.cooldownReduction;
            const cooldowns = target.attackCooldowns.map((cooldown) =>
                Math.max(0, cooldown - cooldownReduction),
            );
            const reducedCooldowns = target.attackCooldowns.filter(
                (cooldown, index) => cooldown > cooldowns[index],
            ).length;
            target.attackCooldowns = cooldowns;
            effect = `${reducedCooldowns} recharge${reducedCooldowns > 1 ? "s" : ""} réduite${reducedCooldowns > 1 ? "s" : ""} de ${cooldownReduction} tour${cooldownReduction === 1 ? "" : "s"}`;
        } else {
            return;
        }
        this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, 0, effect);
        this.finishAttack();
    }

    protected executeAreaAttack(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        zone: readonly Position[],
    ): void {
        const attackOrigin = { ...attacker.position };
        let hitSomething = false;
        if (attack.movesToZone) {
            const landing = this.getSlimeLanding(attacker, attack, zone);
            if (landing) {
                const previousPosition = attacker.position;
                attacker.position = { ...landing };
                attacker.facing = getFacingFromMovement(previousPosition, landing, attacker.facing);
            }
        }

        for (const monster of this.placedMonsters) {
            const isInZone = zone.some(
                (cell) =>
                    cell.x === monster.position.x &&
                    cell.y === monster.position.y &&
                    this.isAttackCellInRange(attackOrigin, attack, cell),
            );
            if (
                monster.currentHp > 0 &&
                monster.id !== attacker.id &&
                isInZone &&
                (attack.hitsAllies || monster.owner !== this.currentPlayer) &&
                canAttackMonster(attacker.monster, attack, monster.monster)
            ) {
                monster.currentHp -= attack.damage;
                this.applyAttackStatusEffect(monster, attack.statusEffect);
                if (attack.damage > 0) {
                    this.monsterSpriteView.takeDamage(
                        monster.id,
                        monster.currentHp,
                        monster.position,
                    );
                }
                this.recordAttack(
                    attacker,
                    `${monster.monster.name} (J${monster.owner})`,
                    attack.damage,
                );
                hitSomething = true;
            }
        }
        if (
            this.canAttackBase(attacker) &&
            this.isOpponentStartInAttackZone(zone, attackOrigin, attack)
        ) {
            this.damageOpponentPlayer();
            const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
            this.recordAttack(attacker, `J${opponent} (départ)`, 1);
            hitSomething = true;
        }
        if (!hitSomething) {
            this.recordAttack(attacker, "zone ciblée", 0);
        }
        this.finishAttack();
    }

    protected executeSingleTargetAttack(
        attacker: PlacedMonster,
        attack: Monster["attacks"][number],
        targetPosition: Position,
        target: PlacedMonster | undefined,
        isBackstab: boolean,
    ): void {
        if (!target) {
            if (this.isOpponentStartingPosition(targetPosition)) {
                this.damageOpponentPlayer();
                const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
                this.recordAttack(attacker, `J${opponent} (départ)`, 1);
            } else {
                this.recordAttack(attacker, "case vide", 0);
            }
            this.finishAttack();
            return;
        }
        if (target.owner === this.currentPlayer) return;
        const backstabBonus = attacker.monster.bonusDamageFromBehind ?? 0;
        const damage = attack.damage + (isBackstab ? backstabBonus : 0);
        target.currentHp -= damage;
        this.applyAttackStatusEffect(target, attack.statusEffect);
        if (damage > 0) {
            this.monsterSpriteView.takeDamage(target.id, target.currentHp, target.position);
        }
        this.recordAttack(attacker, `${target.monster.name} (J${target.owner})`, damage);
        this.finishAttack();
    }

    protected applyAttackStatusEffect(
        target: PlacedMonster,
        effect: StatusEffectDefinition | undefined,
    ): void {
        if (target.currentHp <= 0) {
            target.statusEffects = [];
            return;
        }
        if (!effect) return;
        const appliedEffect = { ...effect, remainingTurns: effect.duration };
        target.statusEffects = [
            ...target.statusEffects.filter((status) => status.type !== effect.type),
            appliedEffect,
        ];
    }

    protected recordAttack(
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

    protected finishAttack(): void {
        this.winner ??= getMonsterEliminationWinner(
            this.placedMonsters,
            this.gameConfiguration.monstersKilledForVictory,
        );
        const remainingAttacks = getAvailableSymbolCount(
            "attack",
            this.rolledDice,
            this.diceReserves[this.currentPlayer],
        );
        if (this.winner !== null || remainingAttacks === 0) {
            this.actionMode = { type: "idle" };
        } else if (this.actionMode.type === "attack") {
            this.actionMode = { type: "attack", attackerId: null, attackIndex: null };
        }
        this.render();
    }

    protected damageOpponentPlayer(): void {
        const opponent: PlayerId = this.currentPlayer === 1 ? 2 : 1;
        this.playerHealth[opponent]--;
        if (this.playerHealth[opponent] === 0) this.winner = this.currentPlayer;
    }

    protected isOpponentStartInAttackZone(
        zone: readonly Position[],
        attackOrigin: Position,
        attack: Monster["attacks"][number],
    ): boolean {
        return zone.some(
            (cell) =>
                this.isOpponentStartingPosition(cell) &&
                this.isAttackCellInRange(attackOrigin, attack, cell),
        );
    }
}
