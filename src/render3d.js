import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VW, SKINS } from './levels.js';
import { rng, clamp, lerp } from './util.js';

/**
 * Moteur de rendu 3D (three.js / WebGL2).
 * Repère local : X = x logique − VW/2, Y = altitude (plan de vol à 0), Z = y logique (la caméra regarde vers −Z).
 * Le monde défile vers la caméra ; la caméra reste fixe.
 */
const HALF = VW / 2, WATER_Y = -175, RIM_Y = 7, BIRD_SCALE = 9.4;
const MAX_BIRDS = 480, MAX_CLOUDS = 150, MAX_GLOW = 420, MAX_SEG = 360, MAX_RING = 48, MAX_STACK = 80, MAX_FEATHER = 48, MAX_DEBRIS = 200;

/** Direction artistique par chapitre : ciel HDR, lumière, brume, eau, roche. */
export const LOOKS = [
  { sky: 'aube', exposure: 0.62, env: 1.15, sun: { color: '#ffc7a0', intensity: 2.4, el: 12, az: 0.45 }, fog: { color: '#b08aa3', density: 0.00024 },
    water: { color: '#1b2742', rough: 0.1 }, cliff: { map: 'rock_face_diff', tint: '#b3a4a6' }, top: { map: 'aerial_rocks_diff', nor: 'aerial_rocks_nor', tint: '#b9ad9f' },
    cloud: '#ffd9cf', storm: '#4a4058', bloom: 0.5, sunGlow: null, mist: 0.5 },
  { sky: 'gorges', exposure: 0.7, env: 1.0, sun: { color: '#fff0d6', intensity: 3.4, el: 30, az: 0.85 }, fog: { color: '#a9c4d2', density: 0.0002, mix: 0.6 },
    water: { color: '#0d4852', rough: 0.07 }, cliff: { map: 'boulder_cracked_diff', tint: '#e0a27c' }, top: { map: 'boulder_cracked_diff', nor: 'aerial_rocks_nor', tint: '#f3d2ac' },
    cloud: '#ffffff', storm: '#55606c', bloom: 0.4, sunGlow: { color: '#fff3d8', size: 900, power: 5 }, mist: 0.2 },
  { sky: 'orage', exposure: 0.85, env: 0.95, sun: { color: '#b9c8e6', intensity: 1.3, el: 34, az: -0.7 }, fog: { color: '#4d5a70', density: 0.00038, mix: 0.6 },
    water: { color: '#0f1a2a', rough: 0.2 }, cliff: { map: 'rock_face_diff', tint: '#70788a' }, top: { map: 'aerial_rocks_diff', nor: 'aerial_rocks_nor', tint: '#6d7876' },
    cloud: '#8a94a6', storm: '#1c212c', bloom: 0.55, sunGlow: null, mist: 0.75, rain: true },
  { sky: 'mer', exposure: 0.72, env: 1.05, sun: { color: '#ffae6c', intensity: 3.2, el: 8 }, fog: { color: '#c58c84', density: 0.00024 },
    water: { color: '#191a36', rough: 0.085 }, cliff: { map: 'rock_face_diff', tint: '#6f5a66' }, top: { map: 'aerial_rocks_diff', nor: 'aerial_rocks_nor', tint: '#7d6d64' },
    cloud: '#ffbfa2', storm: '#2c1e3c', bloom: 0.6, sunGlow: { color: '#ffb070', size: 1100, power: 6 }, mist: 0.4 },
  { sky: 'boreale', exposure: 1.7, env: 1.3, sun: { color: '#b8d6ff', intensity: 1.0, el: 38, az: -0.5 }, fog: { color: '#0b1828', density: 0.00026 },
    water: { color: '#040a15', rough: 0.07 }, cliff: { map: 'rock_face_diff', tint: '#5f7088' }, top: { map: 'aerial_beach_diff', nor: 'aerial_beach_nor', tint: '#e6eff8' },
    cloud: '#5a8aa6', storm: '#1c2a40', bloom: 0.8, sunGlow: null, mist: 0.5, aurora: true, stars: true, moon: true },
];

const FOG_PARS = 'uniform vec3 uFogColor; uniform float uFogDensity;';
const FOG_APPLY = 'float fgd = vFogD * uFogDensity; col = mix(col, uFogColor, 1.0 - exp(-fgd * fgd));';

// bruit de valeur déterministe pour sculpter les falaises
function hash2(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}

function instanced(base, attrs, count) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  const out = {};
  for (const [name, size] of attrs) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a); out[name] = a;
  }
  g.instanceCount = 0;
  return { g, a: out };
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8090a0, 0.0003);
    this.cam = new THREE.PerspectiveCamera(58, 0.5, 4, 14000);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.skies = {}; this.tex = {}; this.geo = {};
    this.U = {
      uTime: { value: 0 }, uFogColor: { value: this.scene.fog.color }, uFogDensity: { value: 0.0003 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uDist: { value: 0 },
    };
    this.camP = { pitch: 25, far: 0.6, fov: 58 }; this.camT = { ...this.camP };
    this.w = 390; this.h = 844; this.dpr = 1; this.epoch = -1; this.ci = -1;
    this.bank = new Float32Array(MAX_BIRDS); this.ang = new Float32Array(MAX_BIRDS);
    this.canyonMeshes = new Map(); this.decor = new Map();
    this.quality = 1;
  }

  /* ------------------------------------------------------------ chargement */
  async load(onProgress) {
    const tl = new THREE.TextureLoader(), gl = new GLTFLoader();
    const names = ['rock_face_diff', 'rock_face_nor', 'aerial_rocks_diff', 'aerial_rocks_nor', 'aerial_beach_diff', 'aerial_beach_nor', 'boulder_cracked_diff', 'water_nor', 'moon'];
    const models = ['bird', 'falcon', 'feather', 'stack0', 'stack1', 'stack2'];
    let done = 0; const total = names.length + models.length + 2;
    const tick = () => onProgress && onProgress(++done / total);
    const aniso = Math.min(8, this.r.capabilities.getMaxAnisotropy());
    await Promise.all([
      ...names.map((n) => tl.loadAsync(`assets/tex/${n}.jpg`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
        if (!n.endsWith('nor')) t.colorSpace = THREE.SRGBColorSpace;
        this.tex[n] = t; tick();
      })),
      fetch('assets/sky/sky-info.json').then((r) => r.json()).then((j) => { this.skyInfo = j; }),
      tl.loadAsync('assets/tex/clouds.webp').then((t) => { t.colorSpace = THREE.SRGBColorSpace; this.tex.clouds = t; tick(); }),
      ...models.map((m) => gl.loadAsync(`assets/models/${m}.glb`).then((g) => {
        let geo = null; g.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
        this.geo[m] = geo; tick();
      })),
    ]);
    this.build();
    tick();
  }

  /** Ciel HDR : JPEG en gamma 2 sur [0, 4] (voir tools/assets/process.py), décodé en demi-flottants. */
  async loadSky(name) {
    if (this.skies[name]) return this.skies[name];
    const img = new Image();
    img.src = `assets/sky/${name}.jpg`;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const src = g.getImageData(0, 0, w, h).data, data = new Uint16Array(w * h * 4);
    const lut = new Uint16Array(256);
    for (let i = 0; i < 256; i++) lut[i] = THREE.DataUtils.toHalfFloat(Math.pow(i / 255, 2) * 4);
    const one = THREE.DataUtils.toHalfFloat(1);
    for (let y = 0; y < h; y++) {
      const so = (h - 1 - y) * w * 4, o = y * w * 4; // l'image est stockée de haut en bas
      for (let x = 0; x < w * 4; x += 4) { data[o + x] = lut[src[so + x]]; data[o + x + 1] = lut[src[so + x + 1]]; data[o + x + 2] = lut[src[so + x + 2]]; data[o + x + 3] = one; }
    }
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
    const env = this.pmrem.fromEquirectangular(t).texture;
    return (this.skies[name] = { bg: t, env });
  }

  /* ------------------------------------------------------------ construction de la scène */
  build() {
    const S = this.scene, U = this.U;
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    S.add(this.sun); S.add(this.sun.target);

    // --- eau : deux couches de normales défilantes, reflets du ciel, éclats du soleil
    const water = (this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1b2742, roughness: 0.1, metalness: 0.0, normalMap: this.tex.water_nor, normalScale: new THREE.Vector2(0.75, 0.75) }));
    water.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uDist = U.uDist;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>
        varying vec2 vWxz; uniform float uTime; uniform float uDist;
        vec3 waterN() {
          vec2 p = vec2(vWxz.x, uDist - vWxz.y);
          vec3 a = texture2D(normalMap, p / 64.0 + vec2(uTime * 0.03, uTime * 0.05)).xyz * 2.0 - 1.0;
          vec3 b = texture2D(normalMap, p / 23.0 + vec2(-uTime * 0.07, uTime * 0.04)).xyz * 2.0 - 1.0;
          vec3 c = texture2D(normalMap, p / 260.0 + vec2(uTime * 0.008, 0.0)).xyz * 2.0 - 1.0;
          return normalize(vec3((a.xy + b.xy * 0.45 + c.xy * 0.6) * 1.35, 1.0));
        }`).replace('#include <normal_fragment_maps>', 'vec3 mapN = waterN(); mapN.xy *= normalScale; normal = normalize(tbn * mapN);')
        // anti-crénelage spéculaire : au loin, les vaguelettes sous-pixel élargissent le reflet au lieu de scintiller
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          vec3 dnW = max(abs(dFdx(normal)), abs(dFdy(normal)));
          material.roughness = min(1.0, material.roughness + max(max(dnW.x, dnW.y), dnW.z) * 1.6);`);
    };
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000), water);
    wm.rotation.x = -Math.PI / 2; wm.position.set(0, WATER_Y, -5000);
    S.add(wm); this.water = wm;

    // --- roche : textures PBR scannées, assombrie et humide vers la ligne d'eau
    const rockPatch = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 wpY = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              wpY = instanceMatrix * wpY;
            #endif
            vWY = (modelMatrix * wpY).y;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float hgt = smoothstep(${WATER_Y.toFixed(1)}, -40.0, vWY);
            diffuseColor.rgb *= mix(vec3(0.34, 0.37, 0.36), vec3(1.0), hgt);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.8, 0.82), smoothstep(${(WATER_Y + 9).toFixed(1)}, ${(WATER_Y + 1).toFixed(1)}, vWY) * 0.55);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = mix(0.45, roughnessFactor, smoothstep(${WATER_Y.toFixed(1)}, ${(WATER_Y + 60).toFixed(1)}, vWY));`);
      };
      return m;
    };
    this.cliffMat = rockPatch(new THREE.MeshStandardMaterial({ map: this.tex.rock_face_diff, normalMap: this.tex.rock_face_nor, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.93, metalness: 0, side: THREE.DoubleSide }));
    this.topMat = new THREE.MeshStandardMaterial({ map: this.tex.aerial_rocks_diff, normalMap: this.tex.aerial_rocks_nor, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    this.stacks = [0, 1, 2].map((i) => {
      const im = new THREE.InstancedMesh(this.geo['stack' + i], this.cliffMat, MAX_STACK);
      im.frustumCulled = false; im.count = 0; S.add(im);
      return im;
    });
    this.canyonGroup = new THREE.Group(); S.add(this.canyonGroup);

    // --- oiseaux : modèle instancié, battement d'ailes dans le vertex shader
    const birdShader = (glow) => new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSky: U.uSky, uGround: U.uGround,
        uFlap: { value: 15 }, uGlow: { value: glow }, uBeak: { value: new THREE.Color('#ffb53a') }, uAmp: { value: 0.85 } },
      side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iRot; attribute vec4 iCol; attribute vec3 color;
        uniform float uTime, uFlap, uAmp;
        varying vec3 vCol; varying vec3 vN; varying float vAccent; varying float vFogD;
        void main() {
          vec3 p = position; vec3 n = normal;
          float w = uv.x; float side = p.x < 0.0 ? -1.0 : 1.0;
          float ph = uTime * uFlap * (0.85 + 0.3 * fract(iRot.w * 7.31)) + iRot.w * 6.2831;
          float ang = (sin(ph - w * 1.3) * uAmp + 0.16) * w;
          float c = cos(ang), s = sin(ang);
          vec2 q = vec2(abs(p.x) - 0.1, p.y - 0.045);
          q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
          p.x = side * (q.x + 0.1); p.y = q.y + 0.045 + sin(ph + 1.2) * 0.04;
          vec2 nq = vec2(side * n.x, n.y); nq = vec2(nq.x * c - nq.y * s, nq.x * s + nq.y * c);
          n.x = side * nq.x; n.y = nq.y;
          float cb = cos(iRot.z), sb = sin(iRot.z);
          p.xy = vec2(p.x * cb - p.y * sb, p.x * sb + p.y * cb);
          n.xy = vec2(n.x * cb - n.y * sb, n.x * sb + n.y * cb);
          vec3 f = vec3(iRot.x, 0.0, iRot.y), r = vec3(iRot.y, 0.0, -iRot.x);
          vec3 wp = iPos + (r * p.x + vec3(0.0, p.y, 0.0) + f * p.z) * iCol.a;
          vN = r * n.x + vec3(0.0, n.y, 0.0) + f * n.z;
          vCol = color * iCol.rgb; vAccent = 1.0 - uv.y;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vFogD = -mv.z; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        ${FOG_PARS} uniform vec3 uSunDir, uSunCol, uSky, uGround, uBeak; uniform float uGlow;
        varying vec3 vCol; varying vec3 vN; varying float vAccent; varying float vFogD;
        void main() {
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec3 base = mix(vCol, uBeak, vAccent);
          float ndl = max(dot(n, uSunDir), 0.0);
          vec3 col = base * (mix(uGround, uSky, n.y * 0.5 + 0.5) * 1.15 + uSunCol * ndl * 0.9);
          col += base * uGlow;
          ${FOG_APPLY}
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const bi = instanced(this.geo.bird, [['iPos', 3], ['iRot', 4], ['iCol', 4]], MAX_BIRDS);
    this.birdMat = birdShader(0);
    this.birds = new THREE.Mesh(bi.g, this.birdMat); this.birds.frustumCulled = false; this.birdA = bi.a; S.add(this.birds);
    const fi = instanced(this.geo.falcon, [['iPos', 3], ['iRot', 4], ['iCol', 4]], 4);
    this.falconMat = birdShader(0); this.falconMat.uniforms.uFlap.value = 9; this.falconMat.uniforms.uAmp.value = 0.35;
    this.falconMat.uniforms.uBeak.value = new THREE.Color('#ffc23a');
    this.falcons = new THREE.Mesh(fi.g, this.falconMat); this.falcons.frustumCulled = false; this.falconA = fi.a; S.add(this.falcons);

    // --- plumes dorées
    this.featherMesh = new THREE.InstancedMesh(this.geo.feather, new THREE.MeshStandardMaterial({ color: '#ffd77a', metalness: 0.85, roughness: 0.28, emissive: '#ffb640', emissiveIntensity: 1.5, side: THREE.DoubleSide }), MAX_FEATHER);
    this.featherMesh.frustumCulled = false; this.featherMesh.count = 0; S.add(this.featherMesh);

    // --- nuages : sprites volumétriques pré-rendus (Cycles), toujours face caméra
    const quad = new THREE.PlaneGeometry(1, 1);
    const ci = instanced(quad, [['iPos', 3], ['iSize', 2], ['iUv', 2], ['iTint', 4]], MAX_CLOUDS);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex.clouds }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec2 iUv; attribute vec4 iTint;
        varying vec2 vUv; varying vec4 vTint; varying float vFogD;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iSize;
          vUv = (uv * 0.92 + 0.04) * 0.5 + iUv; vTint = iTint; vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        ${FOG_PARS} uniform sampler2D uMap; varying vec2 vUv; varying vec4 vTint; varying float vFogD;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          vec3 col = t.rgb * vTint.rgb;
          float fgd = vFogD * uFogDensity * 0.55; col = mix(col, uFogColor, 1.0 - exp(-fgd * fgd));
          float near = smoothstep(30.0, 160.0, vFogD);
          gl_FragColor = vec4(col, t.a * vTint.a * near);
        }`,
    });
    this.clouds = new THREE.Mesh(ci.g, this.cloudMat); this.clouds.frustumCulled = false; this.clouds.renderOrder = 5; this.cloudA = ci.a; S.add(this.clouds);

    // --- halos lumineux (additifs) : étincelles, auras, soleil
    const gi = instanced(quad, [['iPos', 3], ['iSize', 2], ['iCol', 4]], MAX_GLOW);
    this.glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol;
        void main() { vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iSize; vUv = uv * 2.0 - 1.0; vCol = iCol; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec2 vUv; varying vec4 vCol;
        void main() { float d = length(vUv); float a = pow(max(0.0, 1.0 - d), 2.2) + 0.9 * pow(max(0.0, 1.0 - d * 3.0), 3.0); gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0); }`,
    });
    this.glow = new THREE.Mesh(gi.g, this.glowMat); this.glow.frustumCulled = false; this.glow.renderOrder = 8; this.glowA = gi.a; S.add(this.glow);

    // --- segments lumineux dans le plan de vol : éclairs, visée du faucon, rafales
    const si = instanced(quad, [['iA', 3], ['iB', 3], ['iCol', 4], ['iW', 2]], MAX_SEG);
    this.segMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 iA; attribute vec3 iB; attribute vec4 iCol; attribute vec2 iW; varying vec2 vUv; varying vec4 vCol; varying float vDash;
        void main() {
          vec3 d = iB - iA; vec3 pr = normalize(vec3(-d.z, 0.0, d.x) + vec3(0.0001, 0.0, 0.0));
          vec3 wp = mix(iA, iB, uv.x) + pr * (uv.y - 0.5) * iW.x;
          vUv = vec2(uv.x * length(d), uv.y * 2.0 - 1.0); vCol = iCol; vDash = iW.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv; varying vec4 vCol; varying float vDash;
        void main() {
          float a = pow(1.0 - abs(vUv.y), 1.5);
          if (vDash > 0.0) a *= step(0.5, fract(vUv.x / vDash - uTime * 2.5));
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
        }`,
    });
    this.segs = new THREE.Mesh(si.g, this.segMat); this.segs.frustumCulled = false; this.segs.renderOrder = 7; this.segA = si.a; S.add(this.segs);

    // --- anneaux dans le plan de vol : repère, auras, zones de foudre, refuge
    const ri = instanced(quad, [['iPos', 3], ['iRad', 4], ['iCol', 4]], MAX_RING);
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iRad; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; varying vec4 vRad;
        void main() { vec3 wp = iPos + vec3(position.x, 0.0, position.y) * iRad.x * 2.4; vUv = position.xy * 2.4; vCol = iCol; vRad = iRad;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv; varying vec4 vCol; varying vec4 vRad;
        void main() {
          float d = length(vUv); float w = vRad.y / vRad.x;
          float ra = smoothstep(w, 0.0, abs(d - 1.0));
          if (vRad.z > 0.0) ra *= step(0.5, fract(atan(vUv.y, vUv.x) * vRad.z / 6.2831 + uTime * 0.15));
          float a = ra + vRad.w * pow(max(0.0, 1.0 - d), 1.6);
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
        }`,
    });
    this.rings = new THREE.Mesh(ri.g, this.ringMat); this.rings.frustumCulled = false; this.rings.renderOrder = 6; this.ringA = ri.a; S.add(this.rings);

    // --- plumes perdues (oiseaux touchés)
    const di = instanced(quad, [['iPos', 3], ['iRot', 2], ['iCol', 4]], MAX_DEBRIS);
    this.debrisMat = new THREE.ShaderMaterial({
      uniforms: { uFogColor: U.uFogColor, uFogDensity: U.uFogDensity }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 iPos; attribute vec2 iRot; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol;
        void main() { float c = cos(iRot.x), s = sin(iRot.x); vec2 q = vec2(position.x * 5.0, position.y * 1.9 * (0.35 + 0.65 * abs(cos(iRot.x * 1.7))));
          vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iRot.y; vUv = uv * 2.0 - 1.0; vCol = iCol; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vCol; void main() { float a = smoothstep(1.0, 0.75, length(vUv)); gl_FragColor = vec4(vCol.rgb, a * vCol.a); }`,
    });
    this.debris = new THREE.Mesh(di.g, this.debrisMat); this.debris.frustumCulled = false; this.debris.renderOrder = 4; this.debrisA = di.a; S.add(this.debris);

    // --- ciel nocturne : étoiles, lune texturée, aurore
    const sp = new Float32Array(700 * 3), r = rng(11);
    for (let i = 0; i < 700; i++) { const az = (r() - 0.5) * 2.6 - Math.PI / 2, el = Math.pow(r(), 1.4) * 1.2 + 0.02; sp[i * 3] = Math.cos(az) * Math.cos(el) * 9000; sp[i * 3 + 1] = Math.sin(el) * 9000; sp[i * 3 + 2] = Math.sin(az) * Math.cos(el) * 9000; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe2ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.stars.frustumCulled = false; S.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshBasicMaterial({ map: this.tex.moon, color: new THREE.Color(2.6, 2.7, 2.9), fog: false }));
    this.moon.position.set(1150, 1650, -8200); this.moon.lookAt(0, 0, 0); S.add(this.moon);
    this.aurora = new THREE.Mesh(new THREE.PlaneGeometry(15000, 3600, 1, 1), new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        float h(float n) { return fract(sin(n) * 43758.5453); }
        float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
        void main() {
          float x = vUv.x * 9.0;
          float bend = n1(x * 0.6 + uTime * 0.03) * 0.35 + n1(x * 1.7 - uTime * 0.05) * 0.12;
          float y = vUv.y - bend;
          float curtain = pow(n1(x * 7.0 + uTime * 0.12) * 0.6 + n1(x * 19.0 - uTime * 0.2) * 0.4, 1.6);
          float band = smoothstep(0.02, 0.1, y) * smoothstep(0.62, 0.12, y);
          float rays = 0.55 + 0.45 * n1(x * 60.0 + uTime * 0.6);
          float a = band * curtain * rays * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          vec3 col = mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.3, 1.0), smoothstep(0.1, 0.5, y));
          gl_FragColor = vec4(col * a * 1.5, 1.0);
        }`,
    }));
    this.aurora.position.set(0, 2300, -7600); S.add(this.aurora);

    // --- nappes de nuages et brumes d'ambiance (positions locales)
    const cr = rng(5);
    this.amb = [];
    for (let i = 0; i < 12; i++) this.amb.push({ kind: 0, x: (cr() - 0.5) * 6400, y: 260 + cr() * 900, z: -3000 - cr() * 2600, w: 1100 + cr() * 1300, a: 0.55 + cr() * 0.3, s: i % 4 });
    for (let i = 0; i < 12; i++) this.amb.push({ kind: 1, x: (cr() - 0.5) * 1500, y: WATER_Y + 16 + cr() * 50, z: -2800 + cr() * 3400, w: 520 + cr() * 520, a: 0.3 + cr() * 0.25, s: i % 4 });
    for (let i = 0; i < 4; i++) this.amb.push({ kind: 2, x: (cr() - 0.5) * 900, y: 90 + cr() * 60, z: -1800 + cr() * 2400, w: 420 + cr() * 260, a: 0.14 + cr() * 0.1, s: i % 4 });

    // --- post-traitement : bloom HDR puis tone mapping filmique
    this.composer = new EffectComposer(this.r, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 }));
    this.composer.addPass(new RenderPass(S, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 3.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /* ------------------------------------------------------------ chapitre et plumage */
  async setChapter(ci, skinId, glowDefault) {
    const L = (this.look = LOOKS[ci]);
    const sky = await this.loadSky(L.sky);
    this.ci = ci;
    const S = this.scene, U = this.U;
    S.background = sky.bg; S.environment = sky.env;
    S.environmentIntensity = L.env; S.backgroundIntensity = 1;
    this.r.toneMappingExposure = L.exposure;
    // la brume prend la couleur réelle du ciel à l'horizon : la mer se fond dans le ciel sans couture
    const hz = this.skyInfo[L.sky].horizon, zen = this.skyInfo[L.sky].zenith;
    S.fog.color.setRGB(hz[0], hz[1], hz[2]).lerp(new THREE.Color(L.fog.color), L.fog.mix ?? 0.35);
    S.fog.density = L.fog.density; U.uFogDensity.value = L.fog.density;
    // direction du soleil : celle du HDRI (face à la caméra), relevée pour modeler les reliefs
    const az = -Math.PI / 2 + (L.sun.az || 0.06), el = THREE.MathUtils.degToRad(L.sun.el);
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    U.uSunDir.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(1000); this.sun.target.position.set(0, 0, 0);
    this.sun.color.set(L.sun.color); this.sun.intensity = L.sun.intensity;
    U.uSunCol.value.set(L.sun.color).multiplyScalar(L.sun.intensity * 0.4);
    const fogC = S.fog.color;
    U.uSky.value.setRGB(zen[0], zen[1], zen[2]).lerp(fogC, 0.5).multiplyScalar(1.5);
    U.uGround.value.set(L.water.color).lerp(fogC, 0.4);
    this.waterMat.color.set(L.water.color); this.waterMat.roughness = L.water.rough;
    this.cliffMat.map = this.tex[L.cliff.map]; this.cliffMat.color.set(L.cliff.tint); this.cliffMat.needsUpdate = true;
    this.topMat.map = this.tex[L.top.map]; this.topMat.normalMap = this.tex[L.top.nor]; this.topMat.color.set(L.top.tint); this.topMat.needsUpdate = true;
    this.bloom.strength = L.bloom * 0.5;
    this.stars.visible = !!L.stars; this.moon.visible = !!L.moon; this.aurora.visible = !!L.aurora;
    this.cloudTint = new THREE.Color(L.cloud); this.stormTint = new THREE.Color(L.storm);
    this.setSkin(skinId, glowDefault);
  }

  setSkin(skinId, ink) {
    const sk = SKINS.find((s) => s.id === skinId) || SKINS[0];
    this.skinCols = (sk.colors || [ink || '#191330']).map((c) => new THREE.Color(c));
    this.birdMat.uniforms.uGlow.value = sk.glow ? 1.1 : this.ci === 4 ? 0.3 : 0;
    this.accent = new THREE.Color(this.ci === 4 ? '#8ff5d2' : '#ffd9a0');
  }

  /* ------------------------------------------------------------ caméra */
  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.r.setPixelRatio(dpr); this.r.setSize(w, h, false);
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    this.bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    this.cam.aspect = w / h;
    this.placeCamera();
  }

  /** Cadre le terrain logique : sa largeur remplit le bas de l'écran, son bord lointain arrive à la hauteur `far`. */
  placeCamera() {
    const c = this.cam, P = this.camP;
    c.fov = P.fov; c.updateProjectionMatrix();
    const th = THREE.MathUtils.degToRad(P.pitch), half = THREE.MathUtils.degToRad(P.fov / 2);
    const tanH = Math.tan(half), a = c.aspect;
    // rayon (dans l'espace caméra) passant par (nx, ny) en NDC, ramené au sol pour une hauteur de 1
    const hit = (nx, ny) => {
      const dx = nx * tanH * a, dy = ny * tanH, dz = -1;
      const wy = dy * Math.cos(th) + dz * Math.sin(th), wz = -dy * Math.sin(th) + dz * Math.cos(th);
      const t = -1 / wy; // wy < 0 sous l'horizon
      return { x: dx * t, g: -wz * t };
    };
    const b = hit(1, -1), f = hit(0, P.far * 2 - 1);
    const H = (HALF - 22) / b.x;
    this.depth = (f.g - b.g) * H;
    c.position.set(0, H, this.depth + b.g * H);
    c.rotation.set(-th, 0, 0);
    this.camBase = c.position.clone();
    c.updateMatrixWorld();
  }

  /** Position écran (pixels CSS) d'un point logique du plan de vol. */
  project(x, y) {
    const v = new THREE.Vector3(x - HALF, 0, y).project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (0.5 - v.y * 0.5) * this.h };
  }

  /* ------------------------------------------------------------ falaises des gorges */
  buildCanyon(c) {
    const K = 12, n = c.n, step = c.step, rows = [0, 0.035, 0.1, 0.22, 0.4, 0.6, 0.82, 1];
    const tops = [[0, 0], [9, 3], [38, 7], [120, 12], [340, 18], [1100, 8]];
    const grp = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const arr = sgn < 0 ? c.L : c.R, jag = sgn < 0 ? c.jl : c.jr;
      const N = n + 2 * K, M = rows.length, T = tops.length;
      const fp = new Float32Array(N * M * 3), fu = new Float32Array(N * M * 2);
      const tp = new Float32Array(N * T * 3), tu = new Float32Array(N * T * 2);
      for (let q = 0; q < N; q++) {
        const i = q - K, ic = clamp(i, 0, n - 1);
        let rim = arr[ic] + jag[ic];
        const outside = i < 0 ? -i : i > n - 1 ? i - (n - 1) : 0;
        if (outside) rim += sgn * Math.pow(outside / K, 1.8) * 640;
        const gap = clamp(Math.abs((c.R[ic] - c.L[ic]) / 2), 40, 200);
        const lean = Math.min(58, gap * 0.6);
        const z = -i * step, X = rim - HALF, seedv = c.d0 * 0.013 + sgn * 37;
        for (let m = 0; m < M; m++) {
          const t = rows[m];
          const y = RIM_Y - t * (RIM_Y - WATER_Y + 14);
          const ledge = (vnoise(q * 0.23 + seedv, m * 1.7) - 0.5) * 16 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (vnoise(q * 0.06 + seedv, 9.1) - 0.5) * 20 * t;
          const xin = Math.pow(t, 1.35) * lean + ledge;
          const o = (q * M + m) * 3;
          fp[o] = X - sgn * xin; fp[o + 1] = y; fp[o + 2] = z;
          fu[(q * M + m) * 2] = (q * step) / 105; fu[(q * M + m) * 2 + 1] = (y - xin * 0.4) / 105;
        }
        for (let m = 0; m < T; m++) {
          const o = (q * T + m) * 3, off = tops[m][0];
          const bump = m > 1 ? (vnoise(q * 0.11 + seedv, m * 3.3) - 0.3) * 14 * Math.min(1, m / 3) : 0;
          tp[o] = X + sgn * off; tp[o + 1] = RIM_Y + tops[m][1] + bump; tp[o + 2] = z;
          tu[(q * T + m) * 2] = (X + sgn * off) / 120; tu[(q * T + m) * 2 + 1] = (q * step) / 120;
        }
      }
      const grid = (pos, uvs, cols) => {
        const idx = [];
        for (let q = 0; q < N - 1; q++) for (let m = 0; m < cols - 1; m++) {
          const a = q * cols + m, b = a + 1, d = a + cols, e = d + 1;
          if (sgn < 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
      };
      const face = new THREE.Mesh(grid(fp, fu, M), this.cliffMat), top = new THREE.Mesh(grid(tp, tu, T), this.topMat);
      face.frustumCulled = top.frustumCulled = false;
      grp.add(face, top);
    }
    return grp;
  }

  /* ------------------------------------------------------------ synchronisation avec la simulation */
  frame(game, dt) {
    const U = this.U, f = game.flock, dist = game.dist, VH = game.VH;
    U.uTime.value = game.t; U.uDist.value = dist;
    if (game.epoch !== this.epoch) {
      this.epoch = game.epoch;
      for (const m of this.canyonMeshes.values()) { this.canyonGroup.remove(m); m.traverse((o) => o.geometry && o.geometry.dispose()); }
      this.canyonMeshes.clear(); this.decor.clear();
      this.bank.fill(0);
    }

    // caméra : plus basse et plus proche sur l'écran-titre
    const T = this.camT, P = this.camP, title = game.mode === 'attract';
    T.pitch = title ? 17 : 25; T.far = title ? 0.5 : 0.6; T.fov = title ? 52 : 58;
    const k = Math.min(1, dt * 2.5);
    if (Math.abs(T.pitch - P.pitch) + Math.abs(T.far - P.far) + Math.abs(T.fov - P.fov) > 0.001) {
      P.pitch += (T.pitch - P.pitch) * k; P.far += (T.far - P.far) * k; P.fov += (T.fov - P.fov) * k;
      this.placeCamera();
    }
    game.setDepth(this.depth);
    const sh = game.shake * 4;
    this.cam.position.set(this.camBase.x + (Math.random() - 0.5) * sh + (f.cx - HALF) * 0.06, this.camBase.y + (Math.random() - 0.5) * sh, this.camBase.z);
    this.cam.updateMatrixWorld();
    const p0 = this.project(f.tx, f.ty), p1 = this.project(f.tx + 20, f.ty), p2 = this.project(f.tx, f.ty + 20);
    game.kx = 20 / Math.max(2, Math.abs(p1.x - p0.x)); game.ky = 20 / Math.max(2, Math.abs(p2.y - p0.y));

    // gorges
    const alive = new Set();
    for (const c of game.canyons) {
      alive.add(c);
      let m = this.canyonMeshes.get(c);
      if (!m) { m = this.buildCanyon(c); this.canyonMeshes.set(c, m); this.canyonGroup.add(m); }
      m.position.z = dist - c.d0;
    }
    for (const [c, m] of this.canyonMeshes) if (!alive.has(c)) { this.canyonGroup.remove(m); m.traverse((o) => o.geometry && o.geometry.dispose()); this.canyonMeshes.delete(c); }

    // aiguilles (obstacles) et îlots de décor
    const counts = [0, 0, 0], M4 = this._m4 || (this._m4 = new THREE.Matrix4()), Q = this._q || (this._q = new THREE.Quaternion()), V = this._v || (this._v = new THREE.Vector3()), SC = this._s || (this._s = new THREE.Vector3());
    const put = (variant, x, z, r, hgt, rot) => {
      const im = this.stacks[variant]; if (counts[variant] >= MAX_STACK) return;
      Q.setFromAxisAngle(V.set(0, 1, 0), rot);
      M4.compose(V.set(x, WATER_Y - 8, z), Q, SC.set(r, hgt, r));
      im.setMatrixAt(counts[variant]++, M4);
    };
    for (const sp of game.spires) {
      const z = dist - sp.d; if (z > VH + 300) continue;
      put(sp.seed % 3, sp.x - HALF, z, sp.r * 1.04, 203, (sp.seed % 628) / 100);
    }
    const CELL = 300, c0 = Math.floor((dist - VH - 300) / CELL), c1 = Math.floor((dist + 3200) / CELL);
    for (let cell = c0; cell <= c1; cell++) {
      let items = this.decor.get(cell);
      if (!items) {
        items = []; const r = rng(cell * 7919 + 13 + this.ci * 101), d = cell * CELL;
        const blocked = game.ents.some((e) => e.t === 'canyon' && d > e.d0 - 500 && d < e.d0 + e.len + 500);
        if (!blocked) for (let s = -1; s <= 1; s += 2) {
          if (r() < 0.62) items.push({ d: d + r() * CELL, x: s * (330 + Math.pow(r(), 1.5) * 1300), r: 34 + r() * 90, h: 120 + r() * 260, v: Math.floor(r() * 3), rot: r() * 6.28 });
          if (r() < 0.3) items.push({ d: d + r() * CELL, x: s * (300 + r() * 500), r: 16 + r() * 22, h: 70 + r() * 80, v: Math.floor(r() * 3), rot: r() * 6.28 });
        }
        this.decor.set(cell, items);
      }
      for (const it of items) put(it.v, it.x, dist - it.d, it.r, it.h, it.rot);
    }
    for (const key of this.decor.keys()) if (key < c0 - 1) this.decor.delete(key);
    this.stacks.forEach((im, i) => { im.count = counts[i]; im.instanceMatrix.needsUpdate = true; });

    this.syncBirds(game, dt);
    this.syncFx(game, dt);
    this.syncClouds(game, dt);
    this.composer.render();
  }

  syncBirds(game, dt) {
    const f = game.flock, A = this.birdA, ip = A.iPos.array, ir = A.iRot.array, ic = A.iCol.array, cols = this.skinCols, nc = cols.length;
    const sc = BIRD_SCALE * (0.72 + 0.28 * f.dense) * (game.mode === 'attract' ? 1.25 : 1);
    let n = 0;
    for (let i = 0; i < f.n && n < MAX_BIRDS; i++, n++) {
      const sp = Math.hypot(f.vx[i], f.vy[i]) + 1e-3, hx = f.vx[i] / sp, hz = f.vy[i] / sp;
      const a = Math.atan2(hz, hx);
      let da = a - this.ang[i]; if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      this.ang[i] = a;
      const tb = clamp((da / Math.max(dt, 0.008)) * 0.16, -1.0, 1.0);
      this.bank[i] += (tb - this.bank[i]) * 0.12;
      const ph = f.ph[i];
      ip[n * 3] = f.x[i] - HALF; ip[n * 3 + 1] = (ph - 0.5) * 22 * (1.3 - 0.5 * f.hold) + Math.sin(game.t * 1.7 + ph * 40) * 2.5; ip[n * 3 + 2] = f.y[i];
      ir[n * 4] = hx; ir[n * 4 + 1] = hz; ir[n * 4 + 2] = -this.bank[i]; ir[n * 4 + 3] = ph;
      const c = cols[i % nc];
      ic[n * 4] = c.r; ic[n * 4 + 1] = c.g; ic[n * 4 + 2] = c.b; ic[n * 4 + 3] = sc;
    }
    // oiseaux égarés : petits groupes qui tournent en attendant la nuée
    const c = cols[0], t = game.t;
    for (const s of game.strays) {
      if (s.taken) continue;
      const z = game.dist - s.d;
      for (let k = 0; k < s.n && n < MAX_BIRDS; k++, n++) {
        const a = t * 1.9 + s.seed + (k / s.n) * 6.2831, rad = 11 + 3 * Math.sin(t * 2 + k);
        ip[n * 3] = s.x - HALF + Math.cos(a) * rad; ip[n * 3 + 1] = Math.sin(t * 2.2 + k * 1.3) * 4; ip[n * 3 + 2] = z + Math.sin(a) * rad;
        ir[n * 4] = -Math.sin(a); ir[n * 4 + 1] = Math.cos(a); ir[n * 4 + 2] = 0.5; ir[n * 4 + 3] = k * 0.37;
        ic[n * 4] = c.r; ic[n * 4 + 1] = c.g; ic[n * 4 + 2] = c.b; ic[n * 4 + 3] = BIRD_SCALE;
      }
    }
    this.birds.geometry.instanceCount = n;
    A.iPos.needsUpdate = A.iRot.needsUpdate = A.iCol.needsUpdate = true;

    // faucons
    const F = this.falconA; let m = 0;
    for (const fa of game.falcons) {
      if (m >= 4) break;
      let x, z, hx, hz, y = 6;
      if (fa.st === 'dive') { const sp = Math.hypot(fa.vx, fa.vy); x = fa.x; z = fa.y; hx = fa.vx / sp; hz = fa.vy / sp; }
      else { const dx = fa.ax - fa.ox, dz = fa.ay - fa.oy, d = Math.hypot(dx, dz) + 1e-3; hx = dx / d; hz = dz / d; const back = 150 * (1 - fa.t / 1.45); x = fa.ox - hx * back; z = fa.oy - hz * back; y = 6 + back * 0.5; }
      F.iPos.array.set([x - HALF, y, z], m * 3); F.iRot.array.set([hx, hz, 0, 0.3], m * 4); F.iCol.array.set([1, 1, 1, 21], m * 4); m++;
    }
    this.falcons.geometry.instanceCount = m;
    F.iPos.needsUpdate = F.iRot.needsUpdate = F.iCol.needsUpdate = true;

    // plumes dorées
    const M4 = this._m4, Q = this._q, V = this._v, SC = this._s, E = this._e || (this._e = new THREE.Euler());
    let nf = 0;
    for (const fe of game.feathersA) {
      if (fe.taken || nf >= MAX_FEATHER) continue;
      const z = game.dist - fe.d; if (z > game.VH + 80) continue;
      Q.setFromEuler(E.set(0.5 + Math.sin(t * 1.3 + fe.seed) * 0.4, t * 1.6 + fe.seed, 0.4));
      M4.compose(V.set(fe.x - HALF, 2 + Math.sin(t * 2.4 + fe.seed) * 2.5, z), Q, SC.set(13, 13, 13));
      this.featherMesh.setMatrixAt(nf++, M4);
    }
    this.featherMesh.count = nf; this.featherMesh.instanceMatrix.needsUpdate = true;
  }

  syncFx(game, dt) {
    const dist = game.dist, t = game.t, f = game.flock, ac = this.accent;
    const G = this.glowA, R = this.ringA, Sg = this.segA, D = this.debrisA;
    let ng = 0, nr = 0, ns = 0, nd = 0;
    const glow = (x, y, z, size, r, g, b, a) => { if (ng >= MAX_GLOW) return; G.iPos.array.set([x, y, z], ng * 3); G.iSize.array.set([size, size], ng * 2); G.iCol.array.set([r, g, b, a], ng * 4); ng++; };
    const ring = (x, z, rad, wdt, dash, fill, r, g, b, a, y = 1) => { if (nr >= MAX_RING) return; R.iPos.array.set([x, y, z], nr * 3); R.iRad.array.set([rad, wdt, dash, fill], nr * 4); R.iCol.array.set([r, g, b, a], nr * 4); nr++; };
    const seg = (x0, y0, z0, x1, y1, z1, w, dash, r, g, b, a) => { if (ns >= MAX_SEG) return; Sg.iA.array.set([x0, y0, z0], ns * 3); Sg.iB.array.set([x1, y1, z1], ns * 3); Sg.iW.array.set([w, dash], ns * 2); Sg.iCol.array.set([r, g, b, a], ns * 4); ns++; };

    // soleil
    const L = this.look;
    if (L.sunGlow) { const d = this.U.uSunDir.value, c = this._c || (this._c = new THREE.Color()); c.set(L.sunGlow.color); const el = THREE.MathUtils.degToRad(Math.min(L.sun.el, 9)); glow(d.x * 9000, Math.sin(el) * 9000, -9000 * Math.cos(el), L.sunGlow.size, c.r, c.g, c.b, L.sunGlow.power); }

    // repère de la cible
    if (game.mode !== 'attract' && game.state === 'play') {
      const h = f.hold;
      ring(f.tx - HALF, f.ty, lerp(34, 12, h), lerp(1.6, 2.4, h), h < 0.5 ? 14 : 0, 0, 1.6, 1.6, 1.6, lerp(0.35, 0.9, h), 14);
    }
    // oiseaux égarés : aura
    for (const s of game.strays) {
      if (s.taken) continue;
      const z = dist - s.d, pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.seed);
      ring(s.x - HALF, z, 24 + pulse * 5, 2, 0, 0.35, ac.r, ac.g, ac.b, 1.1 - pulse * 0.4);
      glow(s.x - HALF, 3, z, 90, ac.r, ac.g, ac.b, 0.5 + pulse * 0.25);
    }
    for (const fe of game.feathersA) { if (fe.taken) continue; const z = dist - fe.d; if (z < game.VH + 80) glow(fe.x - HALF, 3, z, 30, 1.0, 0.75, 0.3, 0.6); }

    // refuge
    if (game.endD !== Infinity) {
      const z = dist - game.endD;
      if (z > -2600) {
        ring(0, z, 48 + Math.sin(t * 2) * 2, 3, 0, 0.5, ac.r, ac.g, ac.b, 1.6);
        ring(0, z, 70, 1.6, 10, 0, ac.r, ac.g, ac.b, 0.9); ring(0, z, 96, 1.4, 16, 0, ac.r, ac.g, ac.b, 0.6);
        glow(0, 20, z, 420, ac.r, ac.g, ac.b, 0.9);
        seg(0, WATER_Y, z, 0, 900, z + 0.01, 46, 0, ac.r, ac.g, ac.b, 0.5);
      }
    }
    // orages : zone de foudre, charge, éclairs
    for (const st of game.storms) {
      const z = dist - st.d; if (z < -2400) continue;
      const P = st.period, ph = st.tt % P, charge = clamp((ph - (P - 0.8)) / 0.8, 0, 1), x = st.x - HALF;
      ring(x, z, st.r * 0.95, charge > 0 ? 2.6 : 1.6, 26, 0, 1.2, 1.3, 1.6, charge > 0 ? 1.2 : 0.4, 2);
      if (charge > 0) { ring(x, z, st.r * (0.95 + (1 - charge) * 0.7), 2.4, 0, 0, 1.6, 1.7, 2.2, charge, 2); glow(x, 14, z, st.r * 2.2, 0.7, 0.75, 1.0, charge * (0.5 + 0.4 * Math.sin(st.tt * 40))); }
      if (st.fl > 0) {
        const a = st.fl / 0.3;
        glow(x, 16, z, st.r * 3.4, 0.85, 0.9, 1.0, a * 2.5);
        for (const b of st.bolts) for (let i = 0; i + 3 < b.length; i += 2) seg(x + b[i], 12, z + b[i + 1], x + b[i + 2], 12, z + b[i + 3], 5, 0, 2.2, 2.4, 3.2, a * 2.2);
        seg(x, 20, z, x + 6, WATER_Y, z + 10, 7, 0, 2.0, 2.2, 3.0, a * 1.6);
      }
    }
    // faucons : ligne de visée pendant l'alerte, traînée en piqué
    for (const fa of game.falcons) {
      if (fa.st === 'warn') {
        const kk = clamp(fa.t / 1.45, 0, 1);
        seg(fa.ox - HALF, 3, fa.oy, fa.ax - HALF, 3, fa.ay, 3.2, 16, 3.0, 0.35, 0.25, 0.3 + kk * 0.7);
        ring(fa.ax - HALF, fa.ay, 30 - kk * 16, 2.4, 0, 0, 3.0, 0.35, 0.25, 0.4 + kk * 0.6, 3);
      } else glow(fa.x - HALF, 6, fa.y, 60, 1.0, 0.25, 0.15, 0.7);
    }
    // particules de la simulation
    const ink = this.skinCols[0];
    for (const p of game.parts) {
      const a = clamp(p.life / p.max, 0, 1), x = p.x - HALF;
      if (p.k === 'spark') { const c = p.c === 1 ? [1.0, 0.72, 0.25] : p.c === 2 ? [1.0, 0.2, 0.12] : [ac.r, ac.g, ac.b]; glow(x, 4, p.y, 9 + a * 12, c[0], c[1], c[2], a * 1.4); }
      else if (p.k === 'ring') ring(x, p.y, 24 + (1 - a) * 50, 2.4, 0, 0, ac.r, ac.g, ac.b, a * 1.5);
      else if (p.k === 'streak') { const l = 46 * Math.sign(p.vx); seg(x - l, 8, p.y, x, 8, p.y, 1.6, 0, 1, 1, 1, Math.sin(a * Math.PI) * 0.4); }
      else if (p.k === 'feather' && nd < MAX_DEBRIS) { D.iPos.array.set([x, 2 - (1 - a) * 24, p.y], nd * 3); D.iRot.array.set([p.rot, 1.3], nd * 2); D.iCol.array.set([ink.r * 1.4 + 0.02, ink.g * 1.4 + 0.02, ink.b * 1.4 + 0.02, a], nd * 4); nd++; }
    }
    // pluie (chapitre de l'orage)
    if (L.rain) for (let i = 0; i < 70; i++) {
      const x = (Math.random() - 0.5) * 700, z = game.VH - Math.random() * 900, y = 250 - Math.random() * 380;
      seg(x, y, z, x + 1, y - 46, z + 8, 0.9, 0, 0.7, 0.8, 1.0, 0.16);
    }
    this.glow.geometry.instanceCount = ng; this.rings.geometry.instanceCount = nr; this.segs.geometry.instanceCount = ns; this.debris.geometry.instanceCount = nd;
    for (const A of [G, R, Sg, D]) for (const k in A) A[k].needsUpdate = true;
  }

  syncClouds(game, dt) {
    const A = this.cloudA, list = this._cl || (this._cl = []);
    list.length = 0;
    const ct = this.cloudTint, stt = this.stormTint, L = this.look, scroll = game.scroll || 0;
    for (const c of this.amb) {
      if (c.kind) {
        c.z += scroll * dt * (c.kind === 2 ? 1.25 : 1);
        if (c.z > game.VH + 500) { c.z = -2600 - Math.random() * 500; c.x = (Math.random() - 0.5) * (c.kind === 1 ? 1500 : 900); }
      } else c.x += dt * 3;
      const a = c.kind === 1 ? c.a * L.mist : c.a;
      if (a < 0.02) continue;
      list.push([c.x, c.y, c.z, c.w, c.w * (c.kind === 1 ? 0.34 : 0.62), c.s, ct.r, ct.g, ct.b, a]);
    }
    for (const st of game.storms) {
      const z = game.dist - st.d; if (z < -2500) continue;
      const fl = st.fl > 0 ? st.fl / 0.3 : 0, P = st.period, ch = clamp(((st.tt % P) - (P - 0.8)) / 0.8, 0, 1) * 0.35;
      for (const p of st.puffs) {
        const b = 1 + fl * 5 + ch * (0.6 + 0.4 * Math.sin(st.tt * 37 + p[3] * 9));
        const sz = p[2] * 3.1;
        // les volutes hautes accrochent la lumière du ciel, la base reste sombre
        const lt = p[3] * 0.55;
        list.push([st.x - HALF + p[0], 2 + p[3] * 58, z + p[1], sz, sz * 0.8, Math.floor(p[3] * 4) % 4,
          lerp(stt.r, ct.r * 0.8, lt) * b, lerp(stt.g, ct.g * 0.8, lt) * b, lerp(stt.b, ct.b * 0.85, lt) * b * 1.06, 0.95]);
      }
    }
    list.sort((p, q) => p[2] - q[2]);
    const n = Math.min(list.length, MAX_CLOUDS);
    for (let i = 0; i < n; i++) {
      const c = list[i];
      A.iPos.array.set([c[0], c[1], c[2]], i * 3); A.iSize.array.set([c[3], c[4]], i * 2);
      A.iUv.array.set([(c[5] % 2) * 0.5, c[5] > 1 ? 0 : 0.5], i * 2); A.iTint.array.set([c[6], c[7], c[8], c[9]], i * 4);
    }
    this.clouds.geometry.instanceCount = n;
    for (const k in A) A[k].needsUpdate = true;
  }
}
