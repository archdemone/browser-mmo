import type { Enemy } from "./Enemy";
import type { Player } from "./Player";
import { SaveService } from "../state/SaveService";
import { FloatingText } from "../ui/FloatingText";

export class CombatSystem {
  playerAttack(player: Player, enemies: Enemy[]): void {
    const pPos = player.getPosition();
    const range = player.attackRange ?? 2;
    const rangeSq = range * range;

    for (const enemy of enemies) {
      if (enemy.isDead()) {
        continue;
      }

      const ePos = enemy.getPosition();
      const dx = ePos.x - pPos.x;
      const dz = ePos.z - pPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq <= rangeSq) {
        enemy.applyDamage(player.attackDamage);
        FloatingText.spawnDamageText(player.attackDamage);
        if (enemy.isDead()) {
          enemy.dispose();
          SaveService.addXP(10);
        }
      }
    }
  }
}
