import { chinaVisaPhotoSpec } from '../spec';
import type {
  ChinaVisaPhotoSpec,
  ValidationResult,
} from '../types';

interface QualityMetrics {
  averageLuma: number;
  contrast: number;
  backgroundPassRatio: number;
}

export function validateDimensions(
  width: number,
  height: number,
  spec: ChinaVisaPhotoSpec = chinaVisaPhotoSpec,
): ValidationResult[] {
  const aspect = width / height;
  const isAspectValid = Math.abs(aspect - spec.aspectRatio) < 0.0025;
  const isAllowedSize = spec.allowedDimensions.some(
    (option) => option.width === width && option.height === height,
  );

  return [
    {
      status: isAspectValid ? 'pass' : 'fail',
      code: 'aspect-ratio',
      message: isAspectValid
        ? 'Output aspect ratio matches the China visa photo requirement.'
        : 'Output aspect ratio is outside the 354:472 requirement.',
    },
    {
      status: isAllowedSize ? 'pass' : 'fail',
      code: 'dimensions',
      message: isAllowedSize
        ? `Export dimensions are allowed: ${width} × ${height}.`
        : 'Export dimensions must be either 354 × 472 or 420 × 560.',
    },
  ];
}

export function validateFileSize(
  fileSize: number,
  spec: ChinaVisaPhotoSpec = chinaVisaPhotoSpec,
): ValidationResult {
  if (fileSize < spec.fileSizeBytes.min) {
    return {
      status: 'warn',
      code: 'file-size-low',
      message: `JPEG is under the preferred minimum of ${formatKilobytes(spec.fileSizeBytes.min)}.`,
    };
  }

  if (fileSize > spec.fileSizeBytes.max) {
    return {
      status: 'warn',
      code: 'file-size-high',
      message: `JPEG is above the preferred maximum of ${formatKilobytes(spec.fileSizeBytes.max)}.`,
    };
  }

  return {
    status: 'pass',
    code: 'file-size',
    message: `JPEG file size is within the target range: ${formatKilobytes(fileSize)}.`,
  };
}

export function analyzeImageData(
  imageData: ImageData,
  spec: ChinaVisaPhotoSpec = chinaVisaPhotoSpec,
): QualityMetrics {
  const { data, width, height } = imageData;
  let lumaSum = 0;
  let lumaMin = 255;
  let lumaMax = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaMin = Math.min(lumaMin, luma);
    lumaMax = Math.max(lumaMax, luma);
  }

  const averageLuma = lumaSum / (data.length / 4);
  const contrast = lumaMax - lumaMin;

  const insetX = Math.max(1, Math.floor(width * spec.backgroundTolerance.sampleInsetRatio));
  const insetY = Math.max(1, Math.floor(height * spec.backgroundTolerance.sampleInsetRatio));
  const samplePoints = [
    [insetX, insetY],
    [width - insetX - 1, insetY],
    [insetX, height - insetY - 1],
    [width - insetX - 1, height - insetY - 1],
    [Math.floor(width / 2), insetY],
    [Math.floor(width / 2), height - insetY - 1],
  ];

  let backgroundPasses = 0;
  for (const [x, y] of samplePoints) {
    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const channelMin = Math.min(r, g, b);
    const channelMax = Math.max(r, g, b);
    const variance = channelMax - channelMin;

    if (
      channelMin >= spec.backgroundTolerance.minChannelValue &&
      variance <= spec.backgroundTolerance.maxVariance
    ) {
      backgroundPasses += 1;
    }
  }

  return {
    averageLuma,
    contrast,
    backgroundPassRatio: backgroundPasses / samplePoints.length,
  };
}

export function validateQualityMetrics(
  metrics: QualityMetrics,
  spec: ChinaVisaPhotoSpec = chinaVisaPhotoSpec,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (
    metrics.averageLuma < spec.brightnessRange.minAverageLuma ||
    metrics.averageLuma > spec.brightnessRange.maxAverageLuma
  ) {
    results.push({
      status: 'warn',
      code: 'brightness',
      message:
        'Brightness looks outside the preferred range. Retake in even light if the face appears too dim or washed out.',
    });
  } else {
    results.push({
      status: 'pass',
      code: 'brightness',
      message: 'Brightness is within the preferred range.',
    });
  }

  if (metrics.contrast < spec.brightnessRange.minContrast) {
    results.push({
      status: 'warn',
      code: 'contrast',
      message: 'Contrast looks low. The face or background may appear flat or hazy.',
    });
  } else {
    results.push({
      status: 'pass',
      code: 'contrast',
      message: 'Contrast is sufficient for a clear digital photo.',
    });
  }

  if (metrics.backgroundPassRatio < 0.6) {
    results.push({
      status: 'warn',
      code: 'background',
      message:
        'Background edges are not consistently white or near-white. Consider a brighter plain backdrop.',
    });
  } else {
    results.push({
      status: 'pass',
      code: 'background',
      message: 'Background samples look close to white near the frame edges.',
    });
  }

  results.push({
    status: 'warn',
    code: 'manual-review',
    message:
      'Manual check still required for expression, ear visibility, tilt, glare, and facial centering because this tool does not use face detection.',
  });

  return results;
}

export function formatKilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
