import { describe, expect, it } from 'vitest';
import { clampCropToViewport, getRenderedImageMetrics } from './imageMath';
import type { CropState, ImageSource } from '../types';

const source: ImageSource = {
  src: 'test',
  width: 900,
  height: 1200,
  filename: 'portrait.jpg',
};

describe('imageMath', () => {
  it('computes cover sizing for the viewport', () => {
    const crop: CropState = { scale: 1, offsetX: 0, offsetY: 0 };
    const metrics = getRenderedImageMetrics(source, 420, 560, crop);

    expect(metrics.drawnWidth).toBe(420);
    expect(metrics.drawnHeight).toBe(560);
    expect(metrics.originX).toBe(0);
    expect(metrics.originY).toBe(0);
  });

  it('clamps crop offsets so the viewport stays covered', () => {
    const crop: CropState = { scale: 1.2, offsetX: 400, offsetY: -400 };
    const clamped = clampCropToViewport(source, 420, 560, crop);

    expect(clamped.offsetX).toBeLessThanOrEqual(42.1);
    expect(clamped.offsetX).toBeGreaterThanOrEqual(-42.1);
    expect(clamped.offsetY).toBeLessThanOrEqual(56.1);
    expect(clamped.offsetY).toBeGreaterThanOrEqual(-56.1);
  });
});
