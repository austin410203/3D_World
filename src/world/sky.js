// sky.js - physical sky rendered once into a cube map (background + PBR environment), sun light, fog
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function setupSky(renderer, scene) {
  const elevation = 34, azimuth = 205;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));

  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  const skyScene = new THREE.Scene(); skyScene.add(sky);

  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT);
  cubeCam.update(renderer, skyScene);
  scene.background = cubeRT.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(skyScene, 0, 1, 1500).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const fogColor = new THREE.Color(0.66, 0.75, 0.86);
  scene.fog = new THREE.Fog(fogColor, 2500, 42000);

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 90;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5a5040, 0.55);
  scene.add(hemi);

  return {
    sun, sunDir, env,
    follow(p) {   // keep the shadow frustum around the player
      sun.target.position.copy(p);
      sun.position.copy(p).addScaledVector(sunDir, 700);
    },
    setShadowSize(s) {
      Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
      sun.shadow.camera.updateProjectionMatrix();
    },
  };
}
