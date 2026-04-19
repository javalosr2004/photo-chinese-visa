import type { ImageSource } from '../types';
import { loadImageSourceFromBlob } from './exportPhoto';

export interface BackgroundRemovalProgress {
  label: string;
  current: number;
  total: number;
}

export async function removePhotoBackground(
  image: ImageSource,
  onProgress?: (progress: BackgroundRemovalProgress) => void,
): Promise<ImageSource> {
  const { removeBackground } = await import('@imgly/background-removal');

  const transparentBlob = await removeBackground(image.src, {
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (label: string, current: number, total: number) => {
      onProgress?.({ label, current, total });
    },
  });

  const whiteBlob = await flattenForegroundToWhite(transparentBlob);

  return loadImageSourceFromBlob(whiteBlob, toPngFilename(image.filename));
}

function toPngFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  return `${base}-background-removed.png`;
}

async function flattenForegroundToWhite(blob: Blob): Promise<Blob> {
  const image = await loadImageElement(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is not available.');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    const hardenedAlpha = getHardenedAlpha(alpha);

    data[index] = Math.round(data[index] * hardenedAlpha + 255 * (1 - hardenedAlpha));
    data[index + 1] = Math.round(data[index + 1] * hardenedAlpha + 255 * (1 - hardenedAlpha));
    data[index + 2] = Math.round(data[index + 2] * hardenedAlpha + 255 * (1 - hardenedAlpha));
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, 'image/png', 1);
}

function getHardenedAlpha(alpha: number): number {
  if (alpha <= 0.08) {
    return 0;
  }

  if (alpha >= 0.92) {
    return 1;
  }

  const normalized = (alpha - 0.08) / 0.84;
  return Math.min(1, Math.max(0, Math.pow(normalized, 0.55)));
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const src = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(src);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('Unable to load processed image.'));
    };
    image.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error('Canvas export failed.'));
      }
    }, type, quality);
  });
}
