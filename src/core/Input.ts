/**
 * Handles keyboard and mouse input for player controls and exposes a simplified axis for gameplay systems.
 */
export class Input {
  private readonly pressedKeys: Set<string> = new Set();
  private dodgeQueued: boolean = false;
  private attackQueued: boolean = false;
  private spawnEnemyQueued: boolean = false;
  private interactQueued: boolean = false;
  private postFxToggleQueued: boolean = false;
  private readonly virtualMove: Set<"up" | "down" | "left" | "right"> = new Set();
  private virtualSprint: boolean = false;
  private debugAxisOverride: { x: number; z: number } | null = null;
  private readonly keyDownHandler: (event: KeyboardEvent) => void;
  private readonly keyUpHandler: (event: KeyboardEvent) => void;
  private readonly mouseDownHandler: (event: MouseEvent) => void;
  private readonly mouseUpHandler: (event: MouseEvent) => void;
  private readonly pointerDownHandler: (event: PointerEvent) => void;
  private readonly pointerUpHandler: (event: PointerEvent) => void;
  private readonly wheelHandler: (event: WheelEvent) => void;
  private zoomDelta: number = 0;

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

      if (event.code === "KeyP" && !event.repeat) {
        this.postFxToggleQueued = true;
        event.preventDefault();
      }
    };

    this.keyUpHandler = (event: KeyboardEvent) => {
      this.pressedKeys.delete(event.code);
    };

    this.mouseDownHandler = (event: MouseEvent) => {
      console.log(`[INPUT] Mouse down event: button ${event.button}, target: ${(event.target as Element)?.tagName}`);
      const target = event.target as HTMLElement | null;
      if (target && target.closest("#hud-root") && !target.closest(".attack-button")) {
        return;
      }
      if (event.button === 0) {
        // Left click triggers attack by simulating HUD button click
        const attackButton = document.querySelector('.attack-button') as HTMLElement;
        if (attackButton) {
          console.log(`[INPUT] Simulating attack button click`);
          attackButton.click();
        } else {
          // Fallback: directly set attackQueued
          this.attackQueued = true;
          console.log(`[INPUT] Left-click attack triggered (fallback)`);
        }
      }
    };

    this.mouseUpHandler = (_event: MouseEvent) => {
      // Reserved for future mouse state tracking.
    };

    this.pointerDownHandler = (event: PointerEvent) => {
      console.log(`[INPUT] Pointer down event: button ${event.button}, target: ${(event.target as Element)?.tagName}`);
      const target = event.target as HTMLElement | null;
      if (target && target.closest("#hud-root") && !target.closest(".attack-button")) {
        return;
      }
      if (event.button === 0) {
        // Left click triggers attack by simulating HUD button click
        const attackButton = document.querySelector('.attack-button') as HTMLElement;
        if (attackButton) {
          console.log(`[INPUT] Simulating attack button click via pointer`);
          attackButton.click();
        } else {
          // Fallback: directly set attackQueued
          this.attackQueued = true;
          console.log(`[INPUT] Left-click attack triggered (pointer fallback)`);
        }
      }
    };

    this.pointerUpHandler = (_event: PointerEvent) => {
      // Reserved for future pointer state tracking.
    };

    this.wheelHandler = (event: WheelEvent) => {
      // Accumulate zoom delta (negative delta = zoom in, positive = zoom out)
      this.zoomDelta += event.deltaY;
    };

    // Attach to window with capture to intercept events before canvas
    window.addEventListener("keydown", this.keyDownHandler, { capture: true });
    window.addEventListener("keyup", this.keyUpHandler, { capture: true });
    window.addEventListener("pointerdown", this.pointerDownHandler, { capture: true });
    window.addEventListener("pointerup", this.pointerUpHandler, { capture: true });
    window.addEventListener("wheel", this.wheelHandler, { capture: true });

    if (typeof window !== "undefined") {
      (window as unknown as { __qaInput?: Input }).__qaInput = this;
    }
  }

  /**
   * Compute the movement axis based on currently pressed keys.
   */
  getMoveAxis(): { x: number; z: number } {
    const { x, y } = this.getMoveAxes();
    return { x, z: y };
  }

  /**
   * Compute the movement axes relative to camera-aligned X (right) and Y (forward) directions.
   */
  getMoveAxes(): { x: number; y: number } {
    if (this.debugAxisOverride) {
      return { x: this.debugAxisOverride.x, y: this.debugAxisOverride.z };
    }

    let x = 0;
    let y = 0;

    if (this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight")) {
      x += 1;
    }

    if (this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft")) {
      x -= 1;
    }

    if (this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp")) {
      y += 1;
    }

    if (this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown")) {
      y -= 1;
    }

    const virtual = this.getVirtualAxis();
    x += virtual.x;
    y += virtual.z;

    const length = Math.hypot(x, y);
    if (length > 1) {
      const inv = 1 / length;
      x *= inv;
      y *= inv;
    }

    return { x, y };
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

  consumePostFxToggle(): boolean {
    if (this.postFxToggleQueued) {
      this.postFxToggleQueued = false;
      return true;
    }
    return false;
  }

  /**
   * Returns the accumulated zoom delta and resets it to 0.
   * Positive values indicate zoom out, negative values indicate zoom in.
   */
  consumeZoomDelta(): number {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
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

  setDebugAxisOverride(axis: { x: number; z?: number; y?: number } | null): void {
    if (!axis) {
      this.debugAxisOverride = null;
      return;
    }
    const forward = axis.z ?? axis.y ?? 0;
    this.debugAxisOverride = { x: axis.x, z: forward };
  }

  queueDebugDodgeRoll(): void {
    this.dodgeQueued = true;
  }

  /**
   * Clean up registered input listeners.
   */
  dispose(): void {
    window.removeEventListener("keydown", this.keyDownHandler, { capture: true });
    window.removeEventListener("keyup", this.keyUpHandler, { capture: true });
    window.removeEventListener("pointerdown", this.pointerDownHandler, { capture: true });
    window.removeEventListener("pointerup", this.pointerUpHandler, { capture: true });
    window.removeEventListener("wheel", this.wheelHandler, { capture: true });

    if (typeof window !== "undefined") {
      const globalRef = window as unknown as { __qaInput?: Input | undefined };
      if (globalRef.__qaInput === this) {
        globalRef.__qaInput = undefined;
      }
    }

    this.virtualMove.clear();
    this.virtualSprint = false;
    this.zoomDelta = 0;
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
