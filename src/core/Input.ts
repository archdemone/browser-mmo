/**
 * Handles keyboard input for movement and exposes a simplified axis for gameplay systems.
 */
export class Input {
  private readonly pressedKeys: Set<string> = new Set();
  private readonly keyDownHandler: (event: KeyboardEvent) => void;
  private readonly keyUpHandler: (event: KeyboardEvent) => void;

  constructor() {
    this.keyDownHandler = (event: KeyboardEvent) => {
      this.pressedKeys.add(event.code);
    };

    this.keyUpHandler = (event: KeyboardEvent) => {
      this.pressedKeys.delete(event.code);
    };

    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  /**
   * Compute the movement axis based on currently pressed keys.
   */
  getMoveAxis(): { x: number; z: number } {
    let x: number = 0;
    let z: number = 0;

    if (this.pressedKeys.has("KeyW")) {
      z += 1;
    }

    if (this.pressedKeys.has("KeyS")) {
      z -= 1;
    }

    if (this.pressedKeys.has("KeyA")) {
      x -= 1;
    }

    if (this.pressedKeys.has("KeyD")) {
      x += 1;
    }

    const length: number = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }

    return { x, z };
  }

  /**
   * Clean up registered input listeners.
   */
  dispose(): void {
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
  }

  // TODO: Add mouse support for click-to-move and ability casting hotkeys.
}
