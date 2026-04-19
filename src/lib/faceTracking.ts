import type { GuideOverlayState, RenderMetrics, ValidationResult } from '../types';
import type { BoundingBox, Detection, FaceDetector } from '@mediapipe/tasks-vision';

const TASKS_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const FACE_DETECTOR_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

type RunningMode = 'IMAGE' | 'VIDEO';
type FaceKeypointName =
  | 'rightEye'
  | 'leftEye'
  | 'nose'
  | 'mouth'
  | 'rightEar'
  | 'leftEar';

interface RawPoint {
  x: number;
  y: number;
  score?: number;
}

export interface RawFaceTrackingResult {
  sourceWidth: number;
  sourceHeight: number;
  boundingBox: BoundingBox;
  keypoints: Partial<Record<FaceKeypointName, RawPoint>>;
}

export interface OverlayPoint {
  x: number;
  y: number;
  label: string;
}

export interface FaceTrackingOverlay {
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  points: OverlayPoint[];
}

export interface FaceTrackingAssessment {
  overlay: FaceTrackingOverlay | null;
  validations: ValidationResult[];
}

let faceDetectorPromise: Promise<FaceDetector> | null = null;
let currentRunningMode: RunningMode | null = null;

export async function detectFaceInImage(
  image: HTMLImageElement,
): Promise<RawFaceTrackingResult | null> {
  const detector = await getFaceDetector('IMAGE');
  const result = detector.detect(image);
  return mapDetectionResult(result.detections[0], image.naturalWidth, image.naturalHeight);
}

export async function detectFaceInVideo(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<RawFaceTrackingResult | null> {
  const detector = await getFaceDetector('VIDEO');
  const result = detector.detectForVideo(video, timestampMs);
  return mapDetectionResult(result.detections[0], video.videoWidth, video.videoHeight);
}

export function assessFaceTracking(
  tracking: RawFaceTrackingResult,
  metrics: RenderMetrics,
  viewportWidth: number,
  viewportHeight: number,
  guide: GuideOverlayState,
  options: {
    mirrorX?: boolean;
  } = {},
): FaceTrackingAssessment {
  const box = mapBoundingBoxToViewport(
    tracking.boundingBox,
    tracking.sourceWidth,
    tracking.sourceHeight,
    metrics,
    options.mirrorX ?? false,
  );

  const points = Object.entries(tracking.keypoints)
    .map(([name, point]) => {
      if (!point) {
        return null;
      }

      const mapped = mapPointToViewport(
        point,
        metrics,
        options.mirrorX ?? false,
      );

      return {
        x: mapped.x,
        y: mapped.y,
        label: keypointLabel(name as FaceKeypointName),
      };
    })
    .filter((point): point is OverlayPoint => point !== null);

  const validations: ValidationResult[] = [];
  const leftEar = findPoint(points, 'Left ear');
  const rightEar = findPoint(points, 'Right ear');
  const headHeightRatio = box.height / viewportHeight;
  const centerX = box.left + box.width / 2;
  const topGuideY = guide.headTopRatio * viewportHeight;
  const safeLeft = guide.earSafeInsetRatio * viewportWidth;
  const safeRight = viewportWidth - safeLeft;
  const centerOffsetRatio = (centerX - viewportWidth / 2) / viewportWidth;

  if (box.left < 0 || box.top < 0 || box.left + box.width > viewportWidth || box.top + box.height > viewportHeight) {
    validations.push({
      status: 'warn',
      code: 'tracking-frame',
      message: 'Part of the face box is outside the frame. Step back or recenter before capture.',
    });
  } else {
    validations.push({
      status: 'pass',
      code: 'tracking-frame',
      message: 'Face box is fully inside the visible frame.',
    });
  }

  if (Math.abs(centerOffsetRatio) > 0.06) {
    validations.push({
      status: 'warn',
      code: 'tracking-center',
      message:
        centerOffsetRatio > 0
          ? 'Face is drifting to the right. Move slightly left.'
          : 'Face is drifting to the left. Move slightly right.',
    });
  } else {
    validations.push({
      status: 'pass',
      code: 'tracking-center',
      message: 'Face is centered close to the target zone.',
    });
  }

  if (headHeightRatio < guide.headHeightRatioMin) {
    validations.push({
      status: 'warn',
      code: 'tracking-scale-small',
      message: 'Head looks too small in frame. Move closer.',
    });
  } else if (headHeightRatio > guide.headHeightRatioMax) {
    validations.push({
      status: 'warn',
      code: 'tracking-scale-large',
      message: 'Head looks too large in frame. Move slightly farther away.',
    });
  } else {
    validations.push({
      status: 'pass',
      code: 'tracking-scale',
      message: 'Head size is within the preferred framing range.',
    });
  }

  if (box.top > topGuideY + viewportHeight * 0.05) {
    validations.push({
      status: 'warn',
      code: 'tracking-top-low',
      message: 'Head is sitting too low. Raise the camera or move upward.',
    });
  } else if (box.top < topGuideY - viewportHeight * 0.05) {
    validations.push({
      status: 'warn',
      code: 'tracking-top-high',
      message: 'Head is too high near the crown band. Lower the camera or move downward.',
    });
  } else {
    validations.push({
      status: 'pass',
      code: 'tracking-top',
      message: 'Crown position is close to the top guide band.',
    });
  }

  if (leftEar && rightEar) {
    if (leftEar.x < safeLeft || rightEar.x > safeRight) {
      validations.push({
        status: 'warn',
        code: 'tracking-ears',
        message: 'One or both ears are too close to the frame edge. Recenter your head.',
      });
    } else {
      validations.push({
        status: 'pass',
        code: 'tracking-ears',
        message: 'Both ear landmarks appear inside the safe side margins.',
      });
    }
  } else {
    validations.push({
      status: 'warn',
      code: 'tracking-ears-missing',
      message: 'The tracker cannot confirm both ears right now. Keep hair, hood, or tilt from covering them.',
    });
  }

  validations.push({
    status: 'warn',
    code: 'tracking-limit',
    message:
      'Ear checks are approximate landmark guidance, not exact anatomical ear-edge detection.',
  });

  return {
    overlay: {
      box,
      points,
    },
    validations,
  };
}

export function createNoFaceAssessment(message: string): FaceTrackingAssessment {
  return {
    overlay: null,
    validations: [
      {
        status: 'warn',
        code: 'tracking-no-face',
        message,
      },
    ],
  };
}

export function createTrackingLoadingAssessment(message: string): FaceTrackingAssessment {
  return {
    overlay: null,
    validations: [
      {
        status: 'warn',
        code: 'tracking-loading',
        message,
      },
    ],
  };
}

function mapDetectionResult(
  detection: Detection | undefined,
  sourceWidth: number,
  sourceHeight: number,
): RawFaceTrackingResult | null {
  if (!detection?.boundingBox) {
    return null;
  }

  const keypoints: Partial<Record<FaceKeypointName, RawPoint>> = {};
  const orderedFallback: FaceKeypointName[] = [
    'rightEye',
    'leftEye',
    'nose',
    'mouth',
    'rightEar',
    'leftEar',
  ];

  detection.keypoints.forEach((keypoint, index) => {
    const label = normalizeKeypointLabel(keypoint.label) ?? orderedFallback[index];
    if (!label) {
      return;
    }

    keypoints[label] = {
      x: keypoint.x,
      y: keypoint.y,
      score: keypoint.score,
    };
  });

  return {
    sourceWidth,
    sourceHeight,
    boundingBox: detection.boundingBox,
    keypoints,
  };
}

async function getFaceDetector(runningMode: RunningMode): Promise<FaceDetector> {
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');

  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(TASKS_WASM_URL);
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_DETECTOR_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode,
        minDetectionConfidence: 0.6,
      });
      currentRunningMode = runningMode;
      return detector;
    })();

    return faceDetectorPromise;
  }

  const detector = await faceDetectorPromise;
  if (currentRunningMode !== runningMode) {
    await detector.setOptions({ runningMode });
    currentRunningMode = runningMode;
  }

  return detector;
}

function mapPointToViewport(
  point: RawPoint,
  metrics: RenderMetrics,
  mirrorX: boolean,
): { x: number; y: number } {
  const sourceX = mirrorX ? 1 - point.x : point.x;

  return {
    x: metrics.originX + sourceX * metrics.drawnWidth,
    y: metrics.originY + point.y * metrics.drawnHeight,
  };
}

function mapBoundingBoxToViewport(
  box: BoundingBox,
  sourceWidth: number,
  sourceHeight: number,
  metrics: RenderMetrics,
  mirrorX: boolean,
): { left: number; top: number; width: number; height: number } {
  const width = (box.width / sourceWidth) * metrics.drawnWidth;
  const height = (box.height / sourceHeight) * metrics.drawnHeight;
  const leftSource = mirrorX
    ? sourceWidth - (box.originX + box.width)
    : box.originX;

  return {
    left: metrics.originX + (leftSource / sourceWidth) * metrics.drawnWidth,
    top: metrics.originY + (box.originY / sourceHeight) * metrics.drawnHeight,
    width,
    height,
  };
}

function normalizeKeypointLabel(label?: string): FaceKeypointName | null {
  switch (label) {
    case 'left ear tragion':
    case 'left_ear_tragion':
    case 'leftEarTragion':
      return 'leftEar';
    case 'right ear tragion':
    case 'right_ear_tragion':
    case 'rightEarTragion':
      return 'rightEar';
    case 'left eye':
    case 'left_eye':
    case 'leftEye':
      return 'leftEye';
    case 'right eye':
    case 'right_eye':
    case 'rightEye':
      return 'rightEye';
    case 'nose tip':
    case 'nose_tip':
    case 'noseTip':
      return 'nose';
    case 'mouth center':
    case 'mouth_center':
    case 'mouthCenter':
      return 'mouth';
    default:
      return null;
  }
}

function keypointLabel(name: FaceKeypointName): string {
  switch (name) {
    case 'leftEar':
      return 'Left ear';
    case 'rightEar':
      return 'Right ear';
    case 'leftEye':
      return 'Left eye';
    case 'rightEye':
      return 'Right eye';
    case 'mouth':
      return 'Mouth';
    case 'nose':
      return 'Nose';
  }
}

function findPoint(points: OverlayPoint[], label: string): OverlayPoint | undefined {
  return points.find((point) => point.label === label);
}
