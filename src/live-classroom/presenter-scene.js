export const sceneWidth = 1280;
export const sceneHeight = 720;

export const sceneLayerNames = {
  background: 'Background image',
  slides: 'Shared window',
  camera: 'Camera',
};

export const initialScene = {
  order: ['background', 'slides', 'camera'],
  layers: {
    background: { x: 0, y: 0, size: 100, visible: true },
    slides: { x: 4, y: 8, size: 84, visible: true },
    camera: { x: 56, y: 56, size: 44, visible: true, mirror: false, cutout: true },
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function editSceneLayer(scene, id, patch) {
  const layer = { ...scene.layers[id], ...patch };
  layer.size = clamp(layer.size, 12, 100);
  layer.x = clamp(layer.x, 0, 100 - layer.size);
  layer.y = clamp(layer.y, 0, 100 - layer.size);
  return { ...scene, layers: { ...scene.layers, [id]: layer } };
}

export function moveSceneLayer(scene, id, direction) {
  const order = [...scene.order];
  const index = order.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return scene;
  [order[index], order[next]] = [order[next], order[index]];
  return { ...scene, order };
}

export function drawPresenterScene(context, scene, sources) {
  context.fillStyle = '#17161d';
  context.fillRect(0, 0, sceneWidth, sceneHeight);
  for (const id of scene.order) {
    const layer = scene.layers[id];
    const source = sources[id];
    if (!layer.visible || !source) continue;
    const sourceWidth = source.displayWidth ?? source.width;
    const sourceHeight = source.displayHeight ?? source.height;
    if (!sourceWidth || !sourceHeight) continue;
    const left = sceneWidth * layer.x / 100;
    const top = sceneHeight * layer.y / 100;
    const width = sceneWidth * layer.size / 100;
    const height = sceneHeight * layer.size / 100;
    const fit = id === 'background' ? Math.max : Math.min;
    const scale = fit(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;

    context.save();
    context.beginPath();
    context.rect(left, top, width, height);
    context.clip();
    context.translate(left + width / 2, top + (id === 'camera' ? height - drawHeight : (height - drawHeight) / 2));
    if (layer.mirror) context.scale(-1, 1);
    context.drawImage(source, -drawWidth / 2, 0, drawWidth, drawHeight);
    context.restore();
  }
}
