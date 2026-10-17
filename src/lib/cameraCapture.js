// Live-camera capture for the stack scanner. The preview <video> is shown
// with `object-fit: cover`, so what the user sees is a scaled, centered,
// cropped view of the real camera frame — a card-shaped guide drawn over the
// preview has to be mapped back into real video pixels before cropping.

// A trading card's own proportions (63 × 88 mm — the standard size for every
// game this app stocks), used for the on-screen guide.
export const CARD_ASPECT = 63 / 88;

// Maps a rectangle on the displayed preview (box-relative CSS pixels) to the
// matching rectangle in the underlying video frame, for an element shown
// with object-fit: cover. Clamped to the frame. Pure, so it's unit-tested.
export function coverRectToVideoRect(videoW, videoH, boxW, boxH, rect) {
  const scale = Math.max(boxW / videoW, boxH / videoH);
  const offsetX = (boxW - videoW * scale) / 2;
  const offsetY = (boxH - videoH * scale) / 2;
  let x = (rect.x - offsetX) / scale;
  let y = (rect.y - offsetY) / scale;
  let w = rect.w / scale;
  let h = rect.h / scale;
  // Clamp to the frame (a guide can sit slightly past the visible video on
  // unusual aspect ratios).
  const x2 = Math.min(videoW, x + w);
  const y2 = Math.min(videoH, y + h);
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.max(1, x2 - x);
  h = Math.max(1, y2 - y);
  return { x, y, w, h };
}

// Grabs the current video frame, cropped to the guide (plus a little margin,
// so a card held slightly off the guide isn't clipped), downscaled so its
// long side is at most maxDim, as a JPEG data URL. 1024px keeps a single
// card's name, set symbol and collector number legible for the vision model
// while staying small enough to keep dozens of cards in the on-device stack.
export function captureGuideFromVideo(video, guideEl, { maxDim = 1024, quality = 0.85, margin = 0.06 } = {}) {
  const box = video.getBoundingClientRect();
  const g = guideEl.getBoundingClientRect();
  const mx = g.width * margin, my = g.height * margin;
  const rect = coverRectToVideoRect(video.videoWidth, video.videoHeight, box.width, box.height, {
    x: g.left - box.left - mx, y: g.top - box.top - my, w: g.width + 2 * mx, h: g.height + 2 * my,
  });
  const scale = Math.min(1, maxDim / Math.max(rect.w, rect.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.w * scale);
  canvas.height = Math.round(rect.h * scale);
  canvas.getContext('2d').drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// A short confirmation beep (like ManaBox's scan sound), via Web Audio so
// there's no audio file to ship. Best-effort — silently does nothing where
// audio isn't available or allowed.
let audioCtx = null;
export function playScanBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch { /* no sound */ }
}
