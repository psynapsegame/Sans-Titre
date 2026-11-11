// Sprites du jeu : rendus 3D pré-calculés (Blender), teintés à la volée selon le chapitre et le plumage.
const FILES = {
  birds: 'birds.png', falcon: 'falcon.png', feather: 'feather.png', pine0: 'pine0.png', pine1: 'pine1.png', pine0_shadow: 'pine0_shadow.png', pine1_shadow: 'pine1_shadow.png',
  stack0: 'stack0.png', stack1: 'stack1.png', stack2: 'stack2.png', clouds: 'clouds.webp', rock: 'rock.jpg',
};
export const SPR = {};
export const BIRD_FRAMES = 8, FALCON_FRAMES = 4;

export async function loadSprites(onProgress) {
  const names = Object.keys(FILES);
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const img = new Image();
    img.src = (window.__NUEE_SPRITES__ && window.__NUEE_SPRITES__[n]) || `assets/sprites/${FILES[n]}`;
    await img.decode();
    SPR[n] = img;
    if (onProgress) onProgress(++done / names.length);
  }));
}

const cache = new Map();
/**
 * Version teintée d'un sprite (mise en cache). Les sprites sont en nuances claires :
 * la teinte est multipliée, `lift` éclaircit ensuite (neige, brume), l'alpha d'origine est conservé.
 */
export function tinted(name, color, scale = 1, lift = 0) {
  const key = `${name}|${color}|${scale}|${lift}`;
  let c = cache.get(key);
  if (c) return c;
  const img = SPR[name];
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  if (lift) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(255,255,255,${lift})`; g.fillRect(0, 0, c.width, c.height); }
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0, c.width, c.height);
  cache.set(key, c);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return c;
}
