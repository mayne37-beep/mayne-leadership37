function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

export function writePortraitMask(confidence, history, image, elapsed, threshold) {
  const { data, width, height } = image;
  // Blend small changes across frames. A strong change follows motion without a lingering outline.
  const blend = elapsed > 180 || elapsed <= 0 ? 1 : 1 - Math.exp(-elapsed / 85);
  for (let i = 0; i < confidence.length; i++) {
    const change = confidence[i] - history[i];
    const motion = clamp((Math.abs(change) - 0.22) / 0.46);
    history[i] += change * (blend + (1 - blend) * motion);
  }

  const start = threshold - 0.17;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const above = y > 0 ? row - width : row;
    const below = y + 1 < height ? row + width : row;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const neighbors = history[above + x] + history[below + x] +
        history[x > 0 ? i - 1 : i] + history[x + 1 < width ? i + 1 : i];
      const softened = history[i] * 0.72 + neighbors * 0.07;
      const edge = clamp((softened - start) / 0.36);
      data[i * 4 + 3] = 255 * edge * edge * (3 - 2 * edge);
    }
  }
}
