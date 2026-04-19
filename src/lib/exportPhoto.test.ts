import { describe, expect, it } from 'vitest';
import { findBestJpegQuality } from './exportPhoto';
import { chinaVisaPhotoSpec } from '../spec';

describe('findBestJpegQuality', () => {
  it('converges into the preferred size band when possible', async () => {
    const result = await findBestJpegQuality(async (quality) => {
      const size = Math.round(20_000 + quality * 100_000);
      return new Blob([new Uint8Array(size)]);
    });

    expect(result.blob.size).toBeGreaterThanOrEqual(chinaVisaPhotoSpec.fileSizeBytes.min);
    expect(result.blob.size).toBeLessThanOrEqual(chinaVisaPhotoSpec.fileSizeBytes.max);
    expect(result.withinRange).toBe(true);
  });

  it('returns the closest available result when exact convergence is impossible', async () => {
    const result = await findBestJpegQuality(async () => new Blob([new Uint8Array(10_000)]));

    expect(result.blob.size).toBe(10_000);
    expect(result.withinRange).toBe(false);
  });
});
