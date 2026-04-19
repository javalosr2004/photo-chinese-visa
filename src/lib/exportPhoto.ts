import { chinaVisaPhotoSpec } from '../spec';
import { getRenderedImageMetrics } from './imageMath';
import {
  analyzeImageData,
  validateDimensions,
  validateFileSize,
  validateQualityMetrics,
} from './validators';
import type {
  ChinaVisaPhotoSpec,
  CropState,
  ExportResult,
  ImageSource,
  ValidationResult,
} from '../types';

interface FindQualityOptions {
  minQuality?: number;
  maxQuality?: number;
  attempts?: number;
}

export async function findBestJpegQuality(
  encode: (quality: number) => Promise<Blob>,
  spec: ChinaVisaPhotoSpec = chinaVisaPhotoSpec,
  options: FindQualityOptions = {},
): Promise<{ blob: Blob; quality: number; withinRange: boolean }> {
  const minQuality = options.minQuality ?? 0.45;
  const maxQuality = options.maxQuality ?? 0.95;
  const attempts = options.attempts ?? 7;

  let low = minQuality;
  let high = maxQuality;
  let bestBlob = await encode(high);
  let bestQuality = high;
  let bestDistance = distanceFromRange(bestBlob.size, spec.fileSizeBytes.min, spec.fileSizeBytes.max);
  let withinRange = bestDistance === 0;

  for (let index = 0; index < attempts; index += 1) {
    const quality = Number(((low + high) / 2).toFixed(3));
    const blob = await encode(quality);
    const distance = distanceFromRange(blob.size, spec.fileSizeBytes.min, spec.fileSizeBytes.max);

    if (distance < bestDistance || (distance === bestDistance && blob.size > bestBlob.size)) {
      bestBlob = blob;
      bestQuality = quality;
      bestDistance = distance;
      withinRange = distance === 0;
    }

    if (blob.size > spec.fileSizeBytes.max) {
      high = quality;
    } else if (blob.size < spec.fileSizeBytes.min) {
      low = quality;
    } else {
      bestBlob = blob;
      bestQuality = quality;
      withinRange = true;
      break;
    }
  }

  return {
    blob: bestBlob,
    quality: bestQuality,
    withinRange,
  };
}

export async function exportPhoto({
  image,
  crop,
  targetWidth = chinaVisaPhotoSpec.defaultDimension.width,
  targetHeight = chinaVisaPhotoSpec.defaultDimension.height,
  spec = chinaVisaPhotoSpec,
}: {
  image: ImageSource;
  crop: CropState;
  targetWidth?: number;
  targetHeight?: number;
  spec?: ChinaVisaPhotoSpec;
}): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is not available.');
  }

  const element = await loadHtmlImage(image.src);
  const metrics = getRenderedImageMetrics(image, targetWidth, targetHeight, crop);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    element,
    metrics.originX,
    metrics.originY,
    metrics.drawnWidth,
    metrics.drawnHeight,
  );

  const encoder = async (quality: number): Promise<Blob> => {
    const blob = await canvasToBlob(canvas, spec.jpegMimeType, quality);
    return blob;
  };

  const compressed = await findBestJpegQuality(encoder, spec);
  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const metricsSummary = analyzeImageData(imageData, spec);
  const validations: ValidationResult[] = [
    ...validateDimensions(targetWidth, targetHeight, spec),
    validateFileSize(compressed.blob.size, spec),
    ...validateQualityMetrics(metricsSummary, spec),
  ];

  if (!compressed.withinRange) {
    validations.push({
      status: 'warn',
      code: 'compression-target',
      message:
        'The exporter kept the photo within dimension rules, but the image could not be compressed exactly into the preferred file-size band.',
    });
  }

  const objectUrl = URL.createObjectURL(compressed.blob);

  return {
    blob: compressed.blob,
    width: targetWidth,
    height: targetHeight,
    fileSize: compressed.blob.size,
    jpegQuality: compressed.quality,
    objectUrl,
    validations,
  };
}

export async function loadImageSourceFromFile(file: File): Promise<ImageSource> {
  return loadImageSourceFromBlob(file, file.name);
}

export async function loadImageSourceFromBlob(
  blob: Blob,
  filename: string,
): Promise<ImageSource> {
  const src = URL.createObjectURL(blob);
  const image = await loadHtmlImage(src);

  return {
    src,
    width: image.naturalWidth,
    height: image.naturalHeight,
    filename,
  };
}

export async function captureFrameFromVideo(
  video: HTMLVideoElement,
): Promise<ImageSource> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Video stream is not ready yet.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is not available.');
  }

  context.drawImage(video, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
  const src = URL.createObjectURL(blob);

  return {
    src,
    width: video.videoWidth,
    height: video.videoHeight,
    filename: `camera-capture-${Date.now()}.jpg`,
  };
}

function distanceFromRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }

  if (value > max) {
    return value - max;
  }

  return 0;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas export failed.'));
      }
    }, type, quality);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image source.'));
    image.src = src;
  });
}
