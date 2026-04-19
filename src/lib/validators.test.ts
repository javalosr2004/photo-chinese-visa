import { describe, expect, it } from 'vitest';
import {
  analyzeImageData,
  validateDimensions,
  validateFileSize,
  validateQualityMetrics,
} from './validators';

function createImageData(width: number, height: number, rgba: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = rgba[0];
    pixels[index + 1] = rgba[1];
    pixels[index + 2] = rgba[2];
    pixels[index + 3] = rgba[3];
  }
  return {
    data: pixels,
    width,
    height,
  } as ImageData;
}

describe('validators', () => {
  it('passes valid export dimensions', () => {
    const results = validateDimensions(420, 560);
    expect(results.every((result) => result.status === 'pass')).toBe(true);
  });

  it('warns when file size is outside the preferred range', () => {
    expect(validateFileSize(10_000).status).toBe('warn');
    expect(validateFileSize(80_000).status).toBe('pass');
  });

  it('derives image metrics from image data', () => {
    const metrics = analyzeImageData(createImageData(20, 20, [245, 245, 245, 255]));
    expect(metrics.averageLuma).toBeGreaterThan(200);
    expect(metrics.backgroundPassRatio).toBe(1);
  });

  it('warns when brightness or contrast fall outside thresholds', () => {
    const results = validateQualityMetrics({
      averageLuma: 40,
      contrast: 10,
      backgroundPassRatio: 0.2,
    });

    expect(results.find((result) => result.code === 'brightness')?.status).toBe('warn');
    expect(results.find((result) => result.code === 'contrast')?.status).toBe('warn');
    expect(results.find((result) => result.code === 'background')?.status).toBe('warn');
  });
});
