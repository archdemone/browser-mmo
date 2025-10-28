# FBX to GLB Conversion Instructions

## Method 1: Online Converter (Recommended)
1. Go to https://products.aspose.app/3d/conversion/fbx-to-glb
2. Upload each FBX file and download the GLB version
3. Rename files to match the expected names:
   - `player model.fbx` -> `player_base.glb`
   - `Idle.fbx` -> `player_idle.glb`
   - `run.fbx` -> `player_run.glb`
   - `sprint.fbx` -> `player_sprint.glb`
   - `attack.fbx` -> `player_attack.glb`
   - `spell cast.fbx` -> `player_cast.glb`
   - `dodge roll.fbx` -> `player_dodge.glb`

## Method 2: Blender (If installed)
1. Open Blender
2. File -> Import -> FBX
3. Select the FBX file
4. File -> Export -> glTF 2.0 (.glb/.gltf)
5. Choose GLB format
6. Check "Include Animations"
7. Export

## Expected File Structure
```
src/public/assets/characters/player/
|-- player_base.glb    (base model)
|-- player_idle.glb    (idle animation)
|-- player_run.glb     (run animation)
|-- player_sprint.glb  (sprint animation)
|-- player_attack.glb  (attack animation)
|-- player_cast.glb    (spell cast animation)
`-- player_dodge.glb   (dodge roll animation)
```

## Notes
- Make sure to include skin/rigging data when converting
- Animations should be 30 FPS
- Character should be facing forward (positive Z direction)
- Scale should be reasonable (around 1.8 units tall for human character)
