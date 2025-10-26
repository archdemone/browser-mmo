import type { PlayerProfile } from "../data/PlayerProfile";

export class SaveService {
  // TODO: Persist profile data using localStorage JSON (or similar) for now.
  save(profile: PlayerProfile): void {
    void profile;
    // TODO: Serialize the profile to JSON and store it in localStorage.
  }

  // TODO: Load profile data from localStorage and deserialize into PlayerProfile.
  load(): PlayerProfile | null {
    // TODO: Return null when no saved data exists.
    return null;
  }
}
