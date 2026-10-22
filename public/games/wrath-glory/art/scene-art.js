// Optional presentation layer. Rules and scenario state never depend on artwork.
const manifest = fetch(new URL('./scene-art.json', import.meta.url))
  .then((response) => response.ok ? response.json() : null)
  .catch(() => null);
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./scene-art.css', import.meta.url).href;
document.head.append(stylesheet);
let revision = 0;

export async function renderSceneArt({ scenarioId, sceneId }) {
  const current = ++revision;
  const anchor = document.getElementById('scene-text');
  if (!anchor) return;
  let figure = document.getElementById('scene-art');
  if (!figure) {
    figure = document.createElement('figure');
    figure.id = 'scene-art';
    figure.className = 'scene-art';
    figure.hidden = true;
    anchor.before(figure);
  }
  const data = await manifest;
  if (current !== revision) return;
  const asset = data?.scenarios?.[scenarioId]?.[sceneId];
  if (!asset) {
    figure.hidden = true;
    figure.replaceChildren();
    delete figure.dataset.assetId;
    return;
  }
  const existing = figure.querySelector('img');
  if (figure.dataset.assetId === asset.id && existing?.complete && existing.naturalWidth) {
    figure.hidden = false;
    return;
  }
  figure.hidden = true;
  figure.dataset.assetId = asset.id;
  const img = document.createElement('img');
  img.alt = asset.alt;
  img.width = asset.width;
  img.height = asset.height;
  img.decoding = 'async';
  img.onload = () => { if (current === revision) figure.hidden = false; };
  img.onerror = () => { if (current === revision) figure.hidden = true; };
  figure.replaceChildren(img);
  img.src = new URL(asset.src, import.meta.url).href;
}
