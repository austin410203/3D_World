// pixel.js - Minecraft-style 16x16 pixel noise textures (multiplied with colours for a blocky look)
import * as THREE from 'three';

const cache = new Map();
export function pixelNoise(size = 16, lo = 0.8, hi = 1.0, seed = 1) {
  const key = `${size}-${lo}-${hi}-${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + (hi - lo) * rnd()) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

// a tiny sprite with an icon/text, used for floating quest markers
export function labelSprite(text, { bg = '#ffd60a', fg = '#111', size = 64, scale = 1.6 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(size * 0.18, size * 0.08, size * 0.64, size * 0.84);
  g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(size * 0.18, size * 0.08, size * 0.64, size * 0.84);
  g.fillStyle = fg; g.font = `900 ${size * 0.62}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, size / 2, size * 0.53);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.setScalar(scale); s.renderOrder = 10;
  return s;
}
