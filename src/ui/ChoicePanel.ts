export interface ChoiceOption {
  id: string;
  name: string;
  description: string;
}

export interface ChoicePanelOptions {
  level: number;
  options: ChoiceOption[];
  onSelect?: (optionId: string) => void;
  onClose?: () => void;
}

export class ChoicePanel {
  private container: HTMLDivElement;
  private overlay: HTMLDivElement;
  private currentOptions: ChoicePanelOptions | null = null;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.style.position = "fixed";
    this.overlay.style.left = "0";
    this.overlay.style.top = "0";
    this.overlay.style.width = "100vw";
    this.overlay.style.height = "100vh";
    this.overlay.style.background = "rgba(0, 0, 0, 0.6)";
    this.overlay.style.display = "none";
    this.overlay.style.alignItems = "center";
    this.overlay.style.justifyContent = "center";
    this.overlay.style.zIndex = "9999";

    this.container = document.createElement("div");
    this.container.style.minWidth = "480px";
    this.container.style.maxWidth = "640px";
    this.container.style.background = "rgba(12, 12, 18, 0.95)";
    this.container.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    this.container.style.borderRadius = "12px";
    this.container.style.padding = "24px";
    this.container.style.boxShadow = "0 24px 48px rgba(0, 0, 0, 0.35)";
    this.container.style.color = "#f8f8f8";
    this.container.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    this.container.style.pointerEvents = "auto";

    this.overlay.appendChild(this.container);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener("click", (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });
  }

  show(options: ChoicePanelOptions): void {
    this.currentOptions = options;
    this.render();
    this.overlay.style.display = "flex";
  }

  hide(): void {
    if (this.overlay.style.display === "none") {
      return;
    }
    this.overlay.style.display = "none";
    this.currentOptions?.onClose?.();
    this.currentOptions = null;
  }

  private render(): void {
    if (!this.currentOptions) {
      return;
    }
    const { level, options, onSelect } = this.currentOptions;
    this.container.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = `Level ${level} Unlock`;
    title.style.margin = "0 0 12px";
    title.style.fontSize = "20px";
    title.style.fontWeight = "600";
    this.container.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = "Choose a skill to unlock.";
    subtitle.style.margin = "0 0 18px";
    subtitle.style.opacity = "0.75";
    subtitle.style.fontSize = "14px";
    this.container.appendChild(subtitle);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "12px";

    options.forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.alignItems = "flex-start";
      card.style.gap = "4px";
      card.style.padding = "16px";
      card.style.background = "rgba(255, 255, 255, 0.05)";
      card.style.border = "1px solid rgba(255, 255, 255, 0.12)";
      card.style.borderRadius = "10px";
      card.style.cursor = "pointer";
      card.style.color = "inherit";
      card.style.textAlign = "left";
      card.style.transition = "background 120ms ease, border 120ms ease";

      card.onmouseenter = () => {
        card.style.background = "rgba(255, 255, 255, 0.12)";
        card.style.borderColor = "rgba(255, 255, 255, 0.24)";
      };
      card.onmouseleave = () => {
        card.style.background = "rgba(255, 255, 255, 0.05)";
        card.style.borderColor = "rgba(255, 255, 255, 0.12)";
      };

      const name = document.createElement("span");
      name.textContent = option.name;
      name.style.fontSize = "16px";
      name.style.fontWeight = "600";

      const desc = document.createElement("span");
      desc.textContent = option.description;
      desc.style.fontSize = "13px";
      desc.style.opacity = "0.8";

      card.appendChild(name);
      card.appendChild(desc);

      card.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect?.(option.id);
        this.hide();
      };

      list.appendChild(card);
    });

    this.container.appendChild(list);

    const closeButton = document.createElement("button");
    closeButton.textContent = "Cancel";
    closeButton.style.marginTop = "18px";
    closeButton.style.alignSelf = "flex-end";
    closeButton.style.padding = "8px 16px";
    closeButton.style.fontSize = "13px";
    closeButton.style.borderRadius = "8px";
    closeButton.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    closeButton.style.background = "rgba(255, 255, 255, 0.08)";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = () => this.hide();
    this.container.appendChild(closeButton);
  }
}

