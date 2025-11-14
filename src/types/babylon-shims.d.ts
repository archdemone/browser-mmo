import { Camera, Observable } from "babylonjs";

declare module "babylonjs" {
  interface Scene {
    /** Some versions omit this; we declare it optionally. */
    onActiveCameraChangedObservable?: Observable<Camera>;
  }
}
