import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GuideFrame } from './components/GuideFrame';
import { ValidationList } from './components/ValidationList';
import {
  captureFrameFromVideo,
  exportPhoto,
  loadImageSourceFromFile,
} from './lib/exportPhoto';
import { removePhotoBackground } from './lib/backgroundRemoval';
import { clampCropToViewport, getRenderedImageMetrics } from './lib/imageMath';
import { chinaVisaPhotoSpec } from './spec';
import { formatKilobytes } from './lib/validators';
import type {
  CropState,
  ExportResult,
  ImageSource,
  SourceMode,
  Stage,
  ValidationResult,
} from './types';

const viewportWidth = chinaVisaPhotoSpec.defaultDimension.width;
const viewportHeight = chinaVisaPhotoSpec.defaultDimension.height;
const initialCrop: CropState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

function App() {
  const [stage, setStage] = useState<Stage>('acquire');
  const [sourceMode, setSourceMode] = useState<SourceMode>('camera');
  const [originalImageSource, setOriginalImageSource] = useState<ImageSource | null>(null);
  const [processedImageSource, setProcessedImageSource] = useState<ImageSource | null>(null);
  const [crop, setCrop] = useState<CropState>(initialCrop);
  const [dragging, setDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [cameraReady, setCameraReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [backgroundRemovalMessage, setBackgroundRemovalMessage] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const originalImageUrlRef = useRef<string | null>(null);
  const processedImageUrlRef = useRef<string | null>(null);
  const exportUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const imageSource = processedImageSource ?? originalImageSource;
  const previewMetrics = useMemo(() => {
    if (!imageSource) {
      return null;
    }

    return getRenderedImageMetrics(imageSource, viewportWidth, viewportHeight, crop);
  }, [crop, imageSource]);

  useEffect(() => {
    if (sourceMode === 'camera' && stage === 'acquire') {
      void startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [sourceMode, stage]);

  useEffect(() => {
    originalImageUrlRef.current = originalImageSource?.src ?? null;
  }, [originalImageSource]);

  useEffect(() => {
    processedImageUrlRef.current = processedImageSource?.src ?? null;
  }, [processedImageSource]);

  useEffect(() => {
    exportUrlRef.current = exportResult?.objectUrl ?? null;
  }, [exportResult]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (originalImageUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(originalImageUrlRef.current);
      }
      if (processedImageUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(processedImageUrlRef.current);
      }
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
    };
  }, []);

  const liveGuideValidations = useMemo<ValidationResult[]>(() => {
    if (!imageSource) {
      return [
        {
          status: 'warn',
          code: 'manual-framing',
          message:
            'Align the crown to the top band, keep the face centered, and size the head to fill about 70% of the frame height.',
        },
        {
          status: 'warn',
          code: 'manual-eyes',
          message:
            'This tool does not detect facial landmarks. Confirm ears, expression, and eye visibility yourself before export.',
        },
      ];
    }

    return [
      {
        status: 'pass',
        code: 'mode',
        message: 'Photo loaded. Drag to center the face and use zoom to match the head zone.',
      },
      {
        status: processedImageSource ? 'pass' : 'warn',
        code: 'background-option',
        message: processedImageSource
          ? 'Background removal is active. Export will flatten the portrait onto a solid white background.'
          : 'Background removal is optional. Use it if the original background is not clean white.',
      },
      {
        status: crop.scale < 1.05 ? 'warn' : 'pass',
        code: 'head-scale',
        message:
          crop.scale < 1.05
            ? 'Subject may be too small. Increase zoom until the head roughly fills the guide silhouette.'
            : 'Zoom level is closer to the recommended head coverage range.',
      },
      {
        status: Math.abs(crop.offsetY) > 42 ? 'warn' : 'pass',
        code: 'vertical-position',
        message:
          Math.abs(crop.offsetY) > 42
            ? 'Subject may be sitting too high or too low relative to the top and chin guides.'
            : 'Vertical alignment stays near the intended crown and chin guide bands.',
      },
    ];
  }, [crop, imageSource, processedImageSource]);

  async function startCamera() {
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not available in this browser.');
      return;
    }

    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to access camera.');
      setCameraReady(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  async function handleCapture() {
    if (!videoRef.current) {
      return;
    }

    const nextImage = await captureFrameFromVideo(videoRef.current);
    replaceOriginalImageSource(nextImage);
    clearProcessedImageSource();
    clearExportResult();
    setBackgroundRemovalMessage('');
    setCrop(initialCrop);
    setStage('adjust');
    stopCamera();
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextImage = await loadImageSourceFromFile(file);
    replaceOriginalImageSource(nextImage);
    clearProcessedImageSource();
    clearExportResult();
    setBackgroundRemovalMessage('');
    setCrop(initialCrop);
    setStage('adjust');
  }

  async function handleRemoveBackground() {
    if (!imageSource || isRemovingBackground) {
      return;
    }

    setIsRemovingBackground(true);
    setBackgroundRemovalMessage(
      'Removing background. The first run may take longer while the model downloads.',
    );
    clearExportResult();

    try {
      const nextImage = await removePhotoBackground(imageSource, ({ label, current, total }) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        setBackgroundRemovalMessage(`Downloading ${label}... ${percent}%`);
      });

      replaceProcessedImageSource(nextImage);
      setBackgroundRemovalMessage('Background removed. Export will render it onto pure white.');
    } catch (error) {
      setBackgroundRemovalMessage(
        error instanceof Error
          ? `Background removal failed: ${error.message}`
          : 'Background removal failed. Try again with a clearer portrait photo.',
      );
    } finally {
      setIsRemovingBackground(false);
    }
  }

  function handleRestoreOriginal() {
    clearProcessedImageSource();
    clearExportResult();
    setBackgroundRemovalMessage('Restored the original photo.');
  }

  async function handleExport() {
    if (!imageSource) {
      return;
    }

    setIsExporting(true);
    clearExportResult();

    try {
      const result = await exportPhoto({
        image: imageSource,
        crop: clampCropToViewport(imageSource, viewportWidth, viewportHeight, crop),
      });
      replaceExportResult(result);
      setStage('export');
    } finally {
      setIsExporting(false);
    }
  }

  function resetToAcquire(nextMode: SourceMode) {
    setSourceMode(nextMode);
    setStage('acquire');
    setCrop(initialCrop);
    setBackgroundRemovalMessage('');
    clearExportResult();
    clearProcessedImageSource();
    clearOriginalImageSource();
  }

  function beginDrag(clientX: number, clientY: number) {
    if (!imageSource || isRemovingBackground) {
      return;
    }

    setDragging(true);
    setDragOrigin({ x: clientX, y: clientY });
  }

  function updateDrag(clientX: number, clientY: number) {
    if (!dragging || !dragOrigin || !imageSource) {
      return;
    }

    const deltaX = clientX - dragOrigin.x;
    const deltaY = clientY - dragOrigin.y;
    const nextCrop = clampCropToViewport(imageSource, viewportWidth, viewportHeight, {
      ...crop,
      offsetX: crop.offsetX + deltaX,
      offsetY: crop.offsetY + deltaY,
    });

    setCrop(nextCrop);
    setDragOrigin({ x: clientX, y: clientY });
  }

  function endDrag() {
    setDragging(false);
    setDragOrigin(null);
  }

  function handleZoomChange(value: number) {
    if (!imageSource) {
      return;
    }

    const nextCrop = clampCropToViewport(imageSource, viewportWidth, viewportHeight, {
      ...crop,
      scale: value,
    });
    setCrop(nextCrop);
  }

  function clearOriginalImageSource() {
    setOriginalImageSource((current) => {
      if (current?.src.startsWith('blob:')) {
        URL.revokeObjectURL(current.src);
      }
      return null;
    });
  }

  function replaceOriginalImageSource(nextImage: ImageSource) {
    setOriginalImageSource((current) => {
      if (current?.src.startsWith('blob:')) {
        URL.revokeObjectURL(current.src);
      }
      return nextImage;
    });
  }

  function clearProcessedImageSource() {
    setProcessedImageSource((current) => {
      if (current?.src.startsWith('blob:')) {
        URL.revokeObjectURL(current.src);
      }
      return null;
    });
  }

  function replaceProcessedImageSource(nextImage: ImageSource) {
    setProcessedImageSource((current) => {
      if (current?.src.startsWith('blob:')) {
        URL.revokeObjectURL(current.src);
      }
      return nextImage;
    });
  }

  function clearExportResult() {
    setExportResult((current) => {
      if (current) {
        URL.revokeObjectURL(current.objectUrl);
      }
      return null;
    });
  }

  function replaceExportResult(nextResult: ExportResult) {
    setExportResult((current) => {
      if (current) {
        URL.revokeObjectURL(current.objectUrl);
      }
      return nextResult;
    });
  }

  return (
    <div className="app-shell">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">China Visa Photo Guide</p>
          <h1>Frame it cleanly. Export it within spec.</h1>
          <p className="hero-copy">
            This tool guides the shot, helps you center and size the portrait, and exports a
            JPEG at 420 x 560 with file-size tuning. It does not guarantee acceptance, does not
            use face detection, and only removes backgrounds when you explicitly ask for it.
          </p>
        </div>
        <div className="spec-card">
          <p>Official digital target</p>
          <strong>420 x 560 JPEG</strong>
          <span>Accepted digital sizes: 354 x 472 or 420 x 560</span>
          <span>Preferred file size: 40 KB to 120 KB</span>
        </div>
      </div>

      <main className="workspace">
        <section className="panel control-panel">
          <div className="panel-heading">
            <p className="eyebrow">1. Acquire</p>
            <h2>Choose how the photo enters the tool</h2>
          </div>

          <div className="segmented-control" role="tablist" aria-label="Photo source mode">
            <button
              className={sourceMode === 'camera' ? 'active' : ''}
              onClick={() => resetToAcquire('camera')}
              role="tab"
              aria-selected={sourceMode === 'camera'}
            >
              Camera
            </button>
            <button
              className={sourceMode === 'upload' ? 'active' : ''}
              onClick={() => resetToAcquire('upload')}
              role="tab"
              aria-selected={sourceMode === 'upload'}
            >
              Upload
            </button>
          </div>

          {sourceMode === 'camera' ? (
            <div className="acquire-card">
              <div className="preview-shell preview-shell-camera">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="media-preview media-preview-mirrored"
                  aria-label="Live camera preview"
                  onLoadedData={() => setCameraReady(true)}
                />
                <GuideFrame modeLabel="Live framing guide" />
              </div>
              {cameraError ? <p className="error-text">{cameraError}</p> : null}
              <div className="button-row">
                <button onClick={() => void startCamera()} className="secondary-button">
                  Refresh camera
                </button>
                <button onClick={() => void handleCapture()} disabled={!cameraReady}>
                  Capture photo
                </button>
              </div>
            </div>
          ) : (
            <div className="acquire-card acquire-card-upload">
              <p>
                Upload an existing portrait photo and adjust the crop so the head fits the
                silhouette guide.
              </p>
              <label htmlFor="upload-photo">Choose a photo</label>
              <input
                id="upload-photo"
                type="file"
                accept="image/*"
                onChange={(event) => void handleUploadChange(event)}
              />
            </div>
          )}
        </section>

        <section className="panel editor-panel">
          <div className="panel-heading">
            <p className="eyebrow">2. Adjust</p>
            <h2>Align the photo inside the official portrait shape</h2>
          </div>

          <div
            className={`preview-shell ${dragging ? 'dragging' : ''}`}
            onMouseDown={(event) => beginDrag(event.clientX, event.clientY)}
            onMouseMove={(event) => updateDrag(event.clientX, event.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              beginDrag(touch.clientX, touch.clientY);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              updateDrag(touch.clientX, touch.clientY);
            }}
            onTouchEnd={endDrag}
          >
            <div className="preview-white-base" />
            {imageSource ? (
              <img
                src={imageSource.src}
                alt="Selected source"
                className="media-preview"
                draggable={false}
                style={{
                  left: `${previewMetrics?.originX ?? 0}px`,
                  top: `${previewMetrics?.originY ?? 0}px`,
                  width: `${previewMetrics?.drawnWidth ?? viewportWidth}px`,
                  height: `${previewMetrics?.drawnHeight ?? viewportHeight}px`,
                }}
              />
            ) : (
              <div className="empty-preview">
                <p>No photo loaded yet</p>
                <span>Capture or upload a portrait to continue.</span>
              </div>
            )}
            <GuideFrame subtle={stage === 'export'} modeLabel="Target silhouette" />
          </div>

          <div className="slider-group">
            <label htmlFor="zoom-range">Zoom</label>
            <input
              id="zoom-range"
              type="range"
              min="1"
              max="2.4"
              step="0.01"
              value={crop.scale}
              onChange={(event) => handleZoomChange(Number(event.target.value))}
              disabled={!imageSource || isRemovingBackground}
            />
            <span>{crop.scale.toFixed(2)}x</span>
          </div>

          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => void handleRemoveBackground()}
              disabled={!imageSource || isRemovingBackground}
            >
              {isRemovingBackground ? 'Removing background...' : 'Remove background to white'}
            </button>
            <button
              className="secondary-button"
              onClick={handleRestoreOriginal}
              disabled={!processedImageSource || isRemovingBackground}
            >
              Restore original
            </button>
          </div>

          <p className="helper-text">
            Background removal is optional. It runs locally in the browser and may take longer on
            the first use while model files download.
          </p>
          {backgroundRemovalMessage ? (
            <p className="helper-text helper-text-status">{backgroundRemovalMessage}</p>
          ) : null}

          <div className="button-row">
            <button className="secondary-button" onClick={() => resetToAcquire(sourceMode)}>
              Start over
            </button>
            <button
              onClick={() => void handleExport()}
              disabled={!imageSource || isExporting || isRemovingBackground}
            >
              {isExporting ? 'Exporting...' : 'Export 420 x 560 JPEG'}
            </button>
          </div>
        </section>

        <ValidationList title="Live guide status" validations={liveGuideValidations} />

        <section className="panel export-panel">
          <div className="panel-heading">
            <p className="eyebrow">3. Export</p>
            <h2>Download the compressed visa photo</h2>
          </div>

          {exportResult ? (
            <div className="export-grid">
              <div className="download-card">
                <img
                  src={exportResult.objectUrl}
                  alt="Exported China visa photo"
                  className="export-preview"
                />
                <p>
                  {exportResult.width} x {exportResult.height}
                </p>
                <p>{formatKilobytes(exportResult.fileSize)}</p>
                <p>JPEG quality {exportResult.jpegQuality.toFixed(2)}</p>
                <a
                  className="download-button"
                  href={exportResult.objectUrl}
                  download="china-visa-photo.jpg"
                >
                  Download JPEG
                </a>
              </div>
              <ValidationList title="Export checks" validations={exportResult.validations} />
            </div>
          ) : (
            <div className="empty-export">
              <p>No exported photo yet.</p>
              <span>
                After export, the app shows output dimensions, final file size, and validation
                warnings.
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
