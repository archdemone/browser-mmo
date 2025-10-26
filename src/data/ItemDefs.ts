// Static data definitions for items and equipment.
// TODO: Author item rarities, base types, affixes, and drop tables here.

export interface ItemDefinition {
  id: string;
  name: string;
  // TODO: Include stat modifiers, requirements, and flavor text.
}

export interface InventoryItemInstance {
  definitionId: string;
  // TODO: Store rolled affixes, sockets, and other instance-specific data.
}

// TODO: Provide lookup utilities for item definitions.
