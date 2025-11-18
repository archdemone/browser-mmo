# Feature: Skill Lab UI/UX Refinement

## ✍️ Objective:
Bring the in-game Skill Lab panel fully in line with the Phase 5 expectations from `skill_lab_pipeline_v2.txt`: a three-column inspector, structured component editing, intuitive supports workbench, and a sandbox area that communicates derived stats plus profile/variant controls. While the panel pieces are wired up, the UX is still using placeholder JSON editors, missing A/B compare controls, and glossing over trace/context, so this plan hands those gaps off to the Coder agent.

## 🧭 Phases:
### Phase 0: Audit the running panel
- Walk through `SkillLabPanel`/`SkillDraftStore` to confirm the namespace of header, toolbar buttons, left-list (search + tag chips), inspector cards, support area, and sandbox toggles is already in place.
- Note the current deviations: component editing uses JSON blobs, the skill list only shows names (no inline component preview), support chips don’t surface their op traces, and there is no UI for the variant slot A/B compare that `SkillDraftStore` already provides.

### Phase 1: Harden the inspector/ component UX
- Replace the generic `createJsonCard` controls with explicit form controls per shape/motion/limits/damage, reusing `labeledNumber`/`labeledSelect` helpers so designers have structured data entry instead of freeform JSON.
- Surface each component’s timeline (start/duration/tick) visually, add clear reorder affordances (arrows or drag hints) tied to `reorderComponent`, and let users duplicate/delete via labelled buttons.
- Show component-specific tags or a preview snippet inside the skill list (as the pipeline requested “components expand inline”) so the list column isn’t just a name picker.

### Phase 2: Support and trace clarity
- Display validation state per support card by reading `state.supportIssues` and `validateSupport`, disable invalid checkboxes gracefully, and add the reason text inline.
- Flatten the `opTrace` into either per-support summaries (phase, target, op) or a small timeline panel so designers see exactly what each support changed without reading raw trace text.
- Hook the support panel to the derived skill summary (via `getDerivedSkill()`) so metrics (area, base mult, crit chance) can appear even before the executor is wired up.

### Phase 3: Sandbox/variant polish
- Build UI controls for the variant system (`setVariantSlot`, `saveVariant`, `loadVariant`) so designers can maintain A and B presets and swap between them with a diff indicator.
- Improve the sandbox metrics area to show derived skill stats or at least placeholder bars instead of “Metrics hook pending…”.
- Clarify toggles (low visibility, infinite mana, deterministic) by grouping them with labels and adding tooltips; provide a “Clear keybind” action in the keybind bar to keep bindings editable.

### Phase 4: Clean UX touches
- Remove stray characters (the `\u0007` in the skill list meta line) and add bullet separators or pill chips between level/tags.
- Make the minimize/handle behavior more obvious by showing a “skill lab is hidden” helper when overlay is collapsed.
- Ensure the choice panel invocation uses real profile info (e.g., using the selected `state.simulateLevel`) and consider persisting the low-visibility toggle per session.

## 🔗 Dependencies:
- `SkillDraftStore` and its hooks (`useSkillDraft.ts`) for mutations, undo/redo, autosave, supports, variants, and sandbox toggles.
- `skills/skills.schema.ts` and `supports/supports.schema.ts` for typings and validation logic.
- `DummySpawner`, `KeybindBar`, `ChoicePanel`, and any future metrics executor that feeds derived stats.
- Persistence utilities (`persistence.ts`) if any UI feature needs to read/write snapshots (export/import, commit/clear).

## 💬 Notes:
- The panel already wires undo/redo/autosave labels; keep the status bar as a single row to avoid overcrowding.
- Because the Skill Lab is manually manipulating the DOM, reuse helper functions (`labeledNumber`, `createCard`, etc.) to keep the CSS/styling consistent with the rest of the panel.
- Once variants and support trace are settled, rerun the skill lab acceptance tests from the pipeline (Inspector edits reflect on derived skill, undo/redo, save/commit, A/B compare) and mention any manual verification steps.
