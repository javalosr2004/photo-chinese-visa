export type ValidationStatus = 'pass' | 'warn' | 'fail';
export type Stage = 'acquire' | 'adjust' | 'export';
export type SourceMode = 'camera' | 'upload';

export interface DimensionOption {
  width: number;
  height: number;
  label: string;
}

export interface GuideOverlayState {
  headTopRatio: number;
  headHeightRatioMin: number;
  headHeightRatioMax: number;
  headWidthRatioMin: number;
  headWidthRatioMax: number;
  earSafeInsetRatio: number;
  chinBottomMinRatio: number;
}

export interface ChinaVisaPhotoSpec {
  name: string;
  aspectRatio: number;
  allowedDimensions: DimensionOption[];
  defaultDimension: DimensionOption;
  jpegMimeType: 'image/jpeg';
  fileSizeBytes: {
    min: number;
    max: number;
  };
  backgroundTolerance: {
    minChannelValue: number;
    maxVariance: number;
    sampleInsetRatio: number;
  };
  brightnessRange: {
    minAverageLuma: number;
    maxAverageLuma: number;
    minContrast: number;
  };
  guide: GuideOverlayState;
}

export interface CropState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ImageSource {
  src: string;
  width: number;
  height: number;
  filename: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  code: string;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  fileSize: number;
  jpegQuality: number;
  objectUrl: string;
  validations: ValidationResult[];
}

export interface RenderMetrics {
  drawnWidth: number;
  drawnHeight: number;
  originX: number;
  originY: number;
}
