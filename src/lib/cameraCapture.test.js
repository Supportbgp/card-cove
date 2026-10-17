import { describe, it, expect } from 'vitest';
import { coverRectToVideoRect, CARD_ASPECT } from './cameraCapture.js';

describe('coverRectToVideoRect', () => {
  it('maps a rect 1:1 when the box and video are the same size', () => {
    expect(coverRectToVideoRect(400, 600, 400, 600, { x: 50, y: 60, w: 100, h: 140 }))
      .toEqual({ x: 50, y: 60, w: 100, h: 140 });
  });

  it('undoes object-fit: cover scaling and centering (landscape video in a portrait box)', () => {
    // 1920×1080 video covering a 300×400 box: scale = 400/1080, so the video
    // is drawn 711.1px wide, centered — 205.6px cropped off each side.
    const scale = 400 / 1080;
    const offsetX = (300 - 1920 * scale) / 2;
    const r = coverRectToVideoRect(1920, 1080, 300, 400, { x: 75, y: 50, w: 150, h: 300 });
    expect(r.x).toBeCloseTo((75 - offsetX) / scale, 5);
    expect(r.y).toBeCloseTo(50 / scale, 5);
    expect(r.w).toBeCloseTo(150 / scale, 5);
    expect(r.h).toBeCloseTo(300 / scale, 5);
  });

  it('clamps a rect that extends past the video frame', () => {
    const r = coverRectToVideoRect(100, 100, 100, 100, { x: -10, y: 90, w: 50, h: 50 });
    expect(r).toEqual({ x: 0, y: 90, w: 40, h: 10 });
  });

  it('uses a real trading card\'s 63×88 proportions for the guide', () => {
    expect(CARD_ASPECT).toBeCloseTo(63 / 88, 10);
  });
});
