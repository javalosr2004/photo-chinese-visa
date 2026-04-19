import { chinaVisaPhotoSpec } from '../spec';
import type { GuideOverlayState } from '../types';

interface GuideFrameProps {
  subtle?: boolean;
  modeLabel: string;
}

export function GuideFrame({
  subtle = false,
  modeLabel,
}: GuideFrameProps) {
  const guide = chinaVisaPhotoSpec.guide;

  return (
    <div className={`guide-frame ${subtle ? 'guide-frame-subtle' : ''}`}>
      <div className="frame-mask frame-mask-top" />
      <div className="frame-mask frame-mask-right" />
      <div className="frame-mask frame-mask-bottom" />
      <div className="frame-mask frame-mask-left" />

      <div
        className="head-zone"
        style={getHeadZoneStyle(guide)}
        aria-hidden="true"
      >
        <div className="head-zone-core" />
        <div className="ear-marker ear-marker-left" />
        <div className="ear-marker ear-marker-right" />
      </div>

      <div className="guide-badge">{modeLabel}</div>
      <div className="guide-callout guide-callout-top">Keep crown in this band</div>
      <div className="guide-callout guide-callout-left">Too far</div>
      <div className="guide-callout guide-callout-right">Too close</div>
      <div className="guide-callout guide-callout-bottom">Keep chin above this line</div>
    </div>
  );
}

function getHeadZoneStyle(guide: GuideOverlayState) {
  const headHeight = ((guide.headHeightRatioMin + guide.headHeightRatioMax) / 2) * 100;
  const headWidth = ((guide.headWidthRatioMin + guide.headWidthRatioMax) / 2) * 100;
  const top = guide.headTopRatio * 100;
  const left = (100 - headWidth) / 2;

  return {
    top: `${top}%`,
    left: `${left}%`,
    width: `${headWidth}%`,
    height: `${headHeight}%`,
  };
}
