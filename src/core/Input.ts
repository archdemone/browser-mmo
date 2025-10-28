/**
 * Handles keyboard and mouse input for player controls and exposes a simplified axis for gameplay systems.
 */
export class Input {
  private readonly pressedKeys: Set<string> = new Set();
  private dodgeQueued: boolean = false;
  private attackQueued: boolean = false;
  private readonly keyDownHandler: (event: KeyboardEvent) => void;
  private readonly keyUpHandler: (event: KeyboardEvent) => void;
  private readonly mouseDownHandler: (event: MouseEvent) => void;
  private readonly mouseUpHandler: (event: MouseEvent) => void;

  constructor() {
    this.keyDownHandler = (event: KeyboardEvent) => {
      this.pressedKeys.add(event.code);

      if (event.code === "Space" && !event.repeat) {
        this.dodgeQueued = true;
      }
    };

    this.keyUpHandler = (event: KeyboardEvent) => {
      this.pressedKeys.delete(event.code);
    };

    this.mouseDownHandler = (event: MouseEvent) => {
      if (event.button === 0) {
        this.attackQueued = true;
      }
    };

    this.mouseUpHandler = (_event: MouseEvent) => {
      // Reserved for future mouse state tracking.
    };

    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("mousedown", this.mouseDownHandler);
    window.addEventListener("mouseup", this.mouseUpHandler);

    if (typeof window !== "undefined") {
      (window as unknown as { __qaInput?: Input }).__qaInput = this;
    }
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
   * Indicates whether the player is currently holding a sprint key.
   */
  isSprinting(): boolean {
    return this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight");
  }

  /**
   * Returns true once when the dodge roll input was pressed. Subsequent calls will
   * return false until the key is pressed again.
   */
  consumeDodgeRoll(): boolean {
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      return true;
    }

    return false;
  }

  /**
   * Returns true once when the attack input was pressed. Subsequent calls will
   * return false until the button is pressed again.
   */
  consumeAttack(): boolean {
    if (this.attackQueued) {
      this.attackQueued = false;
      return true;
    }

    return false;
  }

  /**
   * Clean up registered input listeners.
   */
  dispose(): void {
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("mousedown", this.mouseDownHandler);
    window.removeEventListener("mouseup", this.mouseUpHandler);

    if (typeof window !== "undefined") {
      const globalRef = window as unknown as { __qaInput?: Input | undefined };
      if (globalRef.__qaInput === this) {
        globalRef.__qaInput = undefined;
      }
    }
  }

  // TODO: Add mouse support for click-to-move navigation and ability casting hotkeys.
}
