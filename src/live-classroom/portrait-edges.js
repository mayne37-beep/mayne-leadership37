const colorWeights = Float32Array.from({ length: 766 }, (_, difference) =>
  0.16 + 0.84 / (1 + (difference / 52) ** 2));

function axisPositions(sourceSize, targetSize) {
  return Array.from({ length: targetSize }, (_, index) => {
    const coordinate = Math.max(0, Math.min(sourceSize - 1, (index + 0.5) * sourceSize / targetSize - 0.5));
    const low = Math.floor(coordinate);
    return { low, high: Math.min(low + 1, sourceSize - 1), fraction: coordinate - low };
  });
}

export function createPortraitEdgeRefiner(mask, output) {
  const { width, height, data: source } = mask;
  const { width: outWidth, height: outHeight, data: target } = output;
  const xPositions = axisPositions(width, outWidth);
  const yPositions = axisPositions(height, outHeight);
  const guideColumns = Array.from({ length: width }, (_, x) => Math.floor((x + 0.5) * outWidth / width) * 4);
  const guideRows = Array.from({ length: height }, (_, y) => Math.floor((y + 0.5) * outHeight / height) * outWidth * 4);
  const weight = (guide, pixel, anchor) => colorWeights[Math.abs(guide[pixel] - guide[anchor]) +
    Math.abs(guide[pixel + 1] - guide[anchor + 1]) + Math.abs(guide[pixel + 2] - guide[anchor + 2])];

  return guide => {
    for (let y = 0; y < outHeight; y++) {
      const { low: top, high: bottom, fraction: dy } = yPositions[y];
      for (let x = 0; x < outWidth; x++) {
        const { low: left, high: right, fraction: dx } = xPositions[x];
        const pixel = (y * outWidth + x) * 4;
        const a = source[(top * width + left) * 4 + 3];
        const b = source[(top * width + right) * 4 + 3];
        const c = source[(bottom * width + left) * 4 + 3];
        const d = source[(bottom * width + right) * 4 + 3];
        if (a === b && a === c && a === d) {
          target[pixel + 3] = a;
          continue;
        }

        // Give nearby mask samples more influence when their camera colors match this pixel.
        const wa = (1 - dx) * (1 - dy) * weight(guide, pixel, guideRows[top] + guideColumns[left]);
        const wb = dx * (1 - dy) * weight(guide, pixel, guideRows[top] + guideColumns[right]);
        const wc = (1 - dx) * dy * weight(guide, pixel, guideRows[bottom] + guideColumns[left]);
        const wd = dx * dy * weight(guide, pixel, guideRows[bottom] + guideColumns[right]);
        target[pixel + 3] = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
      }
    }
  };
}
