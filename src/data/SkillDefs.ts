// Static data defining player skills and abilities.
// TODO: Enumerate skill metadata, cooldowns, resource costs, and associated ability logic keys.

export interface SkillDefinition {
  id: string;
  name: string;
  cooldown: number;
  // TODO: Reference ability behavior, animations, and targeting details.
}

// TODO: Provide registries for looking up skills by id.
