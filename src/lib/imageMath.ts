import type { CropState, ImageSource, RenderMetrics } from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getRenderedImageMetrics(
  source: ImageSource,
  viewportWidth: number,
  viewportHeight: number,
  crop: CropState,
): RenderMetrics {
  const baseScale = Math.max(
    viewportWidth / source.width,
    viewportHeight / source.height,
  );
  const drawnWidth = source.width * baseScale * crop.scale;
  const drawnHeight = source.height * baseScale * crop.scale;
  const originX = (viewportWidth - drawnWidth) / 2 + crop.offsetX;
  const originY = (viewportHeight - drawnHeight) / 2 + crop.offsetY;

  return {
    drawnWidth,
    drawnHeight,
    originX,
    originY,
  };
}

export function clampCropToViewport(
  source: ImageSource,
  viewportWidth: number,
  viewportHeight: number,
  crop: CropState,
): CropState {
  const metrics = getRenderedImageMetrics(
    source,
    viewportWidth,
    viewportHeight,
    crop,
  );
  const minOffsetX = viewportWidth - metrics.drawnWidth - (viewportWidth - metrics.drawnWidth) / 2;
  const maxOffsetX = (metrics.drawnWidth - viewportWidth) / 2;
  const minOffsetY = viewportHeight - metrics.drawnHeight - (viewportHeight - metrics.drawnHeight) / 2;
  const maxOffsetY = (metrics.drawnHeight - viewportHeight) / 2;

  return {
    ...crop,
    offsetX: clamp(crop.offsetX, minOffsetX, maxOffsetX),
    offsetY: clamp(crop.offsetY, minOffsetY, maxOffsetY),
  };
}

export function getCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
}
