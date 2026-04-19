import type { ChinaVisaPhotoSpec } from './types';

export const chinaVisaPhotoSpec: ChinaVisaPhotoSpec = {
  name: 'China visa digital photo',
  aspectRatio: 354 / 472,
  allowedDimensions: [
    { width: 354, height: 472, label: '354 × 472' },
    { width: 420, height: 560, label: '420 × 560' },
  ],
  defaultDimension: { width: 420, height: 560, label: '420 × 560' },
  jpegMimeType: 'image/jpeg',
  fileSizeBytes: {
    min: 40 * 1024,
    max: 120 * 1024,
  },
  backgroundTolerance: {
    minChannelValue: 225,
    maxVariance: 32,
    sampleInsetRatio: 0.06,
  },
  brightnessRange: {
    minAverageLuma: 95,
    maxAverageLuma: 220,
    minContrast: 38,
  },
  guide: {
    headTopRatio: 0.11,
    headHeightRatioMin: 0.54,
    headHeightRatioMax: 0.7,
    headWidthRatioMin: 0.45,
    headWidthRatioMax: 0.6,
    earSafeInsetRatio: 0.12,
    chinBottomMinRatio: 0.12,
  },
};
