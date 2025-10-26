import type { InventoryItemInstance } from "./ItemDefs";

export interface PlayerProfile {
  level: number;
  xp: number;
  baseStats: {
    maxHealth: number;
    maxResource: number;
    strength: number;
    dexterity: number;
    intelligence: number;
  };
  allocatedPassives: string[];
  learnedSkills: string[];
  skillBarSlots: string[];
  inventory: InventoryItemInstance[];
  equipped: {
    weapon?: InventoryItemInstance;
    offhand?: InventoryItemInstance;
    chest?: InventoryItemInstance;
    helmet?: InventoryItemInstance;
    gloves?: InventoryItemInstance;
    boots?: InventoryItemInstance;
    amulet?: InventoryItemInstance;
    ring1?: InventoryItemInstance;
    ring2?: InventoryItemInstance;
    belt?: InventoryItemInstance;
    // TODO: Extend equipment slots as needed for future gear types.
  };
}
