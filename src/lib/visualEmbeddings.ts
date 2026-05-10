export const VISUAL_EMBEDDING_DIMENSIONS = 512;
export const VISUAL_EMBEDDING_MODEL = "uvb-browser-visual-signature-v1";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image for visual embedding."));
    image.src = dataUrl;
  });
}

function l2Normalize(values: number[]) {
  const norm = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
  return values.map((value) => Number((value / norm).toFixed(6)));
}

export async function dataUrlToVisualEmbedding(dataUrl: string): Promise<number[]> {
  const image = await loadImage(dataUrl);
  const width = 16;
  const height = 16;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare visual embedding canvas.");

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray: number[] = [];
  const saturation: number[] = [];
  const redGreen: number[] = [];
  const blueYellow: number[] = [];

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    gray.push(luminance - 0.5);
    saturation.push(max ? (max - min) / max - 0.5 : -0.5);
    redGreen.push((red - green) * 0.5);
    blueYellow.push((blue - (red + green) / 2) * 0.5);
  }

  const edge: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = gray[y * width + x] ?? 0;
      const right = gray[y * width + Math.min(width - 1, x + 1)] ?? center;
      const down = gray[Math.min(height - 1, y + 1) * width + x] ?? center;
      edge.push(Math.sqrt((right - center) ** 2 + (down - center) ** 2));
    }
  }

  const features = [...gray, ...saturation, ...redGreen, ...blueYellow, ...edge];
  return l2Normalize(features.slice(0, VISUAL_EMBEDDING_DIMENSIONS));
}
