import type { FaceTrackingOverlay } from '../lib/faceTracking';

interface TrackingOverlayProps {
  overlay: FaceTrackingOverlay | null;
}

export function TrackingOverlay({ overlay }: TrackingOverlayProps) {
  if (!overlay) {
    return null;
  }

  return (
    <div className="tracking-overlay" aria-hidden="true">
      <div
        className="tracking-box"
        style={{
          left: `${overlay.box.left}px`,
          top: `${overlay.box.top}px`,
          width: `${overlay.box.width}px`,
          height: `${overlay.box.height}px`,
        }}
      />
      {overlay.points.map((point) => (
        <div
          key={`${point.label}-${point.x}-${point.y}`}
          className="tracking-point"
          style={{
            left: `${point.x}px`,
            top: `${point.y}px`,
          }}
          title={point.label}
        >
          <span />
        </div>
      ))}
    </div>
  );
}
