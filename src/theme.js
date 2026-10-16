// theme.js - visual style themes sharing one world + gameplay:
//   classic : the original realistic look
//   sketch  : white "paper" line-art (pastel tints, grid lines, black outlines)       - reference 1 & 2
//   cozy    : warm isometric city-builder (brick palette, dark flat roofs, rooftop kit) - reference 3 & 4
// Pick with ?style=classic|sketch|cozy (remembered in localStorage) or the in-game T key / start screen.
import * as THREE from 'three';

const q = new URLSearchParams(location.search).get('style');
let saved = null; try { saved = localStorage.getItem('cc-style'); } catch (e) { /* private mode */ }
export const STYLE = ['classic', 'sketch', 'cozy'].includes(q) ? q : ['classic', 'sketch', 'cozy'].includes(saved) ? saved : 'classic';
try { localStorage.setItem('cc-style', STYLE); } catch (e) { /* ignore */ }

export const THEMES = {
  classic: {
    id: 'classic', name: '寫實', toneMapping: THREE.ACESFilmicToneMapping, exposure: 0.95,
    sun: 3.2, sunColor: 0xfff1dc, hemi: 0.55, env: 0.55, shadow: 1.0, fog: [2500, 42000], fogColor: 0xd5e0ed, background: null, outline: 0,
  },
  sketch: {
    id: 'sketch', name: '線稿', toneMapping: THREE.NoToneMapping, exposure: 1.0,
    sun: 1.6, sunColor: 0xffffff, hemi: 1.45, hemiSky: 0xffffff, hemiGround: 0xd8dde0, env: 0.15, shadow: 0.32,
    fog: [900, 9000], fogColor: 0xeef0f0, background: 0xeef0f0, outline: 1, paper: [0.935, 0.945, 0.945],
  },
  cozy: {
    id: 'cozy', name: '溫馨城市', toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.08,
    sun: 2.6, sunColor: 0xffe0b0, hemi: 0.9, hemiSky: 0xfff3dc, hemiGround: 0x6b6a58, env: 0.35, shadow: 0.55,
    fog: [1800, 26000], fogColor: 0xd9d6c4, background: null, outline: 0,
    palette: { brick: 0xb24f37, brick2: 0x8f3e2c, mustard: 0xd7b04e, teal: 0x6f8e8b, slate: 0x56707a, cream: 0xe8dcc0, roof: 0x3b4648, parapet: 0xcfc8b4 },
  },
};
export const T = THEMES[STYLE];

// GLSL colour grade applied to every material of the theme (terrain, roads, plants, water, characters, cars)
export const GRADE_GLSL = {
  classic: 'vec3 styleGrade(vec3 c, vec3 wp){ return c; }',
  sketch: `vec3 styleGrade(vec3 c, vec3 wp){
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 paper = vec3(0.935, 0.945, 0.945);
      vec3 tint = mix(vec3(l), c, 0.55);
      return mix(paper, paper * 0.55 + tint * 0.6, 0.28);
    }`,
  cozy: `vec3 styleGrade(vec3 c, vec3 wp){
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.8);                        // calmer saturation
      float gr = smoothstep(0.0, 0.05, c.g - max(c.r, c.b) * 0.92);   // greens -> fresh sage lawn
      c = mix(c, c * vec3(0.82, 1.18, 0.78) + vec3(0.0, 0.03, 0.0), gr);
      c = c * vec3(1.06, 1.0, 0.86) + vec3(0.035, 0.03, 0.01);   // warm lift
      c = mix(c, floor(c * 9.0 + 0.5) / 9.0, 0.35);     // gentle posterise
      return c;
    }`,
}[STYLE];

// inject the grade into a built-in material (after colour/map are applied)
export function graded(material, { after = '#include <color_fragment>', extra = '' } = {}) {
  if (STYLE === 'classic' && !extra) return material;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    if (!sh.vertexShader.includes('varying vec3 vGWP;')) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvGWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvGWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGWP;\n${GRADE_GLSL}`);
    }
    sh.fragmentShader = sh.fragmentShader.replace(after, `${after}\ndiffuseColor.rgb = styleGrade(diffuseColor.rgb, vGWP);\n${extra}`);
  };
  material.customProgramCacheKey = () => `${STYLE}-${after}-${extra.length}-${prev ? 'p' : ''}`;
  if (STYLE === 'sketch') { if ('roughness' in material) material.roughness = 1; if ('metalness' in material) material.metalness = 0; }
  return material;
}

// JS twin of the grade (for baking colours into exported asset kits)
export function gradeJS(r, g, b) {
  if (STYLE === 'classic') return [r, g, b];
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  if (STYLE === 'sketch') {
    const p = [0.935, 0.945, 0.945], t = [l + (r - l) * 0.55, l + (g - l) * 0.55, l + (b - l) * 0.55];
    return p.map((pv, i) => pv + (pv * 0.55 + t[i] * 0.6 - pv) * 0.28);
  }
  let c = [l + (r - l) * 0.8, l + (g - l) * 0.8, l + (b - l) * 0.8];
  const gr = Math.min(1, Math.max(0, (c[1] - Math.max(c[0], c[2]) * 0.92) / 0.05));
  c = [c[0] + (c[0] * 0.82 - c[0]) * gr, c[1] + (c[1] * 1.18 + 0.03 - c[1]) * gr, c[2] + (c[2] * 0.78 - c[2]) * gr];
  c = [c[0] * 1.06 + 0.035, c[1] + 0.03, c[2] * 0.86 + 0.01];
  return c.map((v) => v + (Math.floor(v * 9 + 0.5) / 9 - v) * 0.35);
}
