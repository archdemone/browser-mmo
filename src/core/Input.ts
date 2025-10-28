/**
 * Handles keyboard and mouse input for player controls and exposes a simplified axis for gameplay systems.
 */
export class Input {
  private readonly pressedKeys: Set<string> = new Set();
  private dodgeQueued: boolean = false;
  private attackQueued: boolean = false;
  private spawnEnemyQueued: boolean = false;
  private interactQueued: boolean = false;
  private readonly virtualMove: Set<"up" | "down" | "left" | "right"> = new Set();
  private virtualSprint: boolean = false;
  private debugAxisOverride: { x: number; z: number } | null = null;
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

      if (event.code === "KeyB" && !event.repeat) {
        this.spawnEnemyQueued = true;
      }

      if (event.code === "KeyE" && !event.repeat) {
        this.interactQueued = true;
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
    if (this.debugAxisOverride) {
      return { x: this.debugAxisOverride.x, z: this.debugAxisOverride.z };
    }

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

    const virtual = this.getVirtualAxis();
    x += virtual.x;
    z += virtual.z;

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
    return (
      this.virtualSprint ||
      this.pressedKeys.has("ShiftLeft") ||
      this.pressedKeys.has("ShiftRight")
    );
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

  consumeSpawnEnemy(): boolean {
    if (this.spawnEnemyQueued) {
      this.spawnEnemyQueued = false;
      return true;
    }
    return false;
  }

  consumeInteract(): boolean {
    if (this.interactQueued) {
      this.interactQueued = false;
      return true;
    }
    return false;
  }

  triggerSpawnEnemy(): void {
    this.spawnEnemyQueued = true;
  }

  pressVirtualMove(direction: "up" | "down" | "left" | "right"): void {
    this.virtualMove.add(direction);
  }

  releaseVirtualMove(direction: "up" | "down" | "left" | "right"): void {
    this.virtualMove.delete(direction);
  }

  setVirtualSprint(active: boolean): void {
    this.virtualSprint = active;
  }

  triggerVirtualAttack(): void {
    this.attackQueued = true;
  }

  triggerVirtualDodge(): void {
    this.dodgeQueued = true;
  }

  setDebugAxisOverride(axis: { x: number; z: number } | null): void {
    this.debugAxisOverride = axis ? { x: axis.x, z: axis.z } : null;
  }

  queueDebugDodgeRoll(): void {
    this.dodgeQueued = true;
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

    this.virtualMove.clear();
    this.virtualSprint = false;
  }

  // TODO: Add mouse support for click-to-move navigation and ability casting hotkeys.
  private getVirtualAxis(): { x: number; z: number } {
    if (this.virtualMove.size === 0) {
      return { x: 0, z: 0 };
    }

    let x = 0;
    let z = 0;

    if (this.virtualMove.has("up") && !this.virtualMove.has("down")) {
      z += 1;
    } else if (this.virtualMove.has("down") && !this.virtualMove.has("up")) {
      z -= 1;
    }

    if (this.virtualMove.has("right") && !this.virtualMove.has("left")) {
      x += 1;
    } else if (this.virtualMove.has("left") && !this.virtualMove.has("right")) {
      x -= 1;
    }

    return { x, z };
  }
}
