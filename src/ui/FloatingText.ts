interface FloatingTextItem {
  el: HTMLDivElement;
  life: number;
  initialY: number;
}

export class FloatingText {
  private static items: FloatingTextItem[] = [];
  private static initialized: boolean = false;

  static init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    // No DOM manipulation needed - we'll create elements on demand
  }

  static spawnDamageText(amount: number): void {
    if (!this.initialized || typeof document === "undefined" || !document.body) {
      return;
    }

    try {
      const el = document.createElement("div");
      el.textContent = amount.toString();
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.top = "60%"; // center-bottom area
      el.style.transform = "translateX(-50%)";
      el.style.color = "#ffffff";
      el.style.fontSize = "16px";
      el.style.fontWeight = "bold";
      el.style.textShadow = "2px 2px 0px #000000";
      el.style.pointerEvents = "none";
      el.style.userSelect = "none";
      el.style.opacity = "1";
      el.style.zIndex = "998";

      document.body.appendChild(el);

      const item: FloatingTextItem = {
        el,
        life: 0.6, // seconds
        initialY: 60 // percent
      };

      this.items.push(item);
    } catch (error) {
      console.warn("[FloatingText] Failed to create damage text:", error);
    }
  }

  static updateAll(deltaTime: number): void {
    if (this.items.length === 0) {
      return;
    }

    this.items = this.items.filter(item => {
      try {
        item.life -= deltaTime;

        if (item.life <= 0) {
          if (item.el.parentNode) {
            item.el.parentNode.removeChild(item.el);
          }
          return false;
        }

        // Animate: move up and fade out
        const progress = 1 - (item.life / 0.6); // 0 to 1
        const newY = item.initialY - (progress * 30); // move up 30% over time
        const opacity = Math.max(0, 1 - (progress * 1.2)); // fade out faster

        item.el.style.top = `${newY}%`;
        item.el.style.opacity = opacity.toString();

        return true;
      } catch (error) {
        console.warn("[FloatingText] Error updating text:", error);
        return false;
      }
    });
  }

  static clear(): void {
    this.items.forEach(item => {
      try {
        if (item.el.parentNode) {
          item.el.parentNode.removeChild(item.el);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    this.items = [];
  }
}
