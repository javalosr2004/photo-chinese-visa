import { describe, expect, it } from 'vitest';
import { assessFaceTracking } from './faceTracking';
import { chinaVisaPhotoSpec } from '../spec';
import type { RenderMetrics } from '../types';

const metrics: RenderMetrics = {
  drawnWidth: 420,
  drawnHeight: 560,
  originX: 0,
  originY: 0,
};

describe('faceTracking', () => {
  it('passes a centered face with both ears visible', () => {
    const assessment = assessFaceTracking(
      {
        sourceWidth: 420,
        sourceHeight: 560,
        boundingBox: {
          originX: 110,
          originY: 62,
          width: 200,
          height: 336,
          angle: 0,
        },
        keypoints: {
          leftEar: { x: 0.28, y: 0.39 },
          rightEar: { x: 0.72, y: 0.39 },
        },
      },
      metrics,
      420,
      560,
      chinaVisaPhotoSpec.guide,
    );

    expect(assessment.validations.find((item) => item.code === 'tracking-center')?.status).toBe('pass');
    expect(assessment.validations.find((item) => item.code === 'tracking-ears')?.status).toBe('pass');
  });

  it('warns when the head is off-center and ears drift out of frame', () => {
    const assessment = assessFaceTracking(
      {
        sourceWidth: 420,
        sourceHeight: 560,
        boundingBox: {
          originX: 220,
          originY: 110,
          width: 180,
          height: 250,
          angle: 0,
        },
        keypoints: {
          leftEar: { x: 0.2, y: 0.38 },
          rightEar: { x: 0.92, y: 0.38 },
        },
      },
      metrics,
      420,
      560,
      chinaVisaPhotoSpec.guide,
    );

    expect(assessment.validations.find((item) => item.code === 'tracking-center')?.status).toBe('warn');
    expect(assessment.validations.find((item) => item.code === 'tracking-ears')?.status).toBe('warn');
  });
});
