const KEY = 'nuee.save.v1';
const defaults = () => ({
  stars: {}, best: {}, feathers: 0, owned: ['etourneau'], skin: 'etourneau',
  endlessBest: 0, sound: true, seenIntro: false,
});

export const save = defaults();

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(save, defaults(), JSON.parse(raw));
  } catch { /* stockage indisponible : on joue sans sauvegarde */ }
  return save;
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignoré */ }
}
export function resetSave() {
  Object.assign(save, defaults());
  persist();
}
