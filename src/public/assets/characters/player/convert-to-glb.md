# FBX to GLB Conversion Instructions

## Method 1: Online Converter (Recommended)
1. Go to https://products.aspose.app/3d/conversion/fbx-to-glb
2. Upload each FBX file and download the GLB version
3. Rename files to match the expected names:
   - `player model.fbx` → `character.glb`
   - `Idle.fbx` → `idle.glb`
   - `run.fbx` → `run.glb`
   - `sprint.fbx` → `sprint.glb`
   - `attack.fbx` → `attack.glb`
   - `spell cast.fbx` → `cast.glb`
   - `dodge roll.fbx` → `dodge.glb`

## Method 2: Blender (If installed)
1. Open Blender
2. File → Import → FBX
3. Select the FBX file
4. File → Export → glTF 2.0 (.glb/.gltf)
5. Choose GLB format
6. Check "Include Animations"
7. Export

## Expected File Structure
```
src/assets/characters/player/
├── character.glb      (base model)
├── idle.glb          (idle animation)
├── run.glb           (run animation)
├── sprint.glb        (sprint animation)
├── attack.glb        (attack animation)
├── cast.glb          (spell cast animation)
└── dodge.glb         (dodge roll animation)
```

## Notes
- Make sure to include skin/rigging data when converting
- Animations should be 30 FPS
- Character should be facing forward (positive Z direction)
- Scale should be reasonable (around 1.8 units tall for human character)
