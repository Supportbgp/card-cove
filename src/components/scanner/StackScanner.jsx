import { useEffect, useRef, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { scanBinderPage } from '../../lib/scanner.js';
import { resizeImageFile } from '../../lib/image.js';
import { GAMES, CONDITION_OPTIONS, PRINTING_OPTIONS_BY_GAME, scanDuplicateKey } from '../../lib/cardUtils.js';
import { loadStack, saveStack } from '../../lib/stackStore.js';
import { CARD_ASPECT, captureGuideFromVideo, playScanBeep } from '../../lib/cameraCapture.js';
import { detectedToRow, findImageCandidates, ScanReview } from './scanShared.jsx';

// Stack scanning — modeled on ManaBox/Mythic Tools-style continuous
// scanning (see CLAUDE.md's "Stack scanner" section): a live camera, one tap
// per card, and every card dropped into a stack that's reviewed and added to
// the catalog in one go. Those apps recognize cards instantly with an
// on-device model; a web app can't, so recognition here is the same vision
// model the binder-page scanner uses (one call per card), run in a
// background queue. The card is in the stack the instant it's snapped —
// staff never wait on recognition to scan the next one.

// Recognition calls in flight at once. Each is a full vision-model call;
// two keeps a fast scanner from queueing far behind without bursting.
const RECOGNITION_CONCURRENCY = 2;

let nextStackId = 1;
function newStackId() {
  return `stk-${Date.now().toString(36)}-${nextStackId++}`;
}

export default function StackScanner({ catalog, locations, onImport, multipliers, destinationLabel = 'catalog' }) {
  const { toast, showConfirm, openLightbox } = useUI();
  // One stack per destination, so a half-finished catalog stack and a
  // quote's stack never mix.
  const storageKey = `stack:${destinationLabel}`;
  const [items, setItems] = useState([]); // newest first
  const [loaded, setLoaded] = useState(false);
  const [camera, setCamera] = useState('off'); // 'off' | 'starting' | 'on' | 'error'
  const [cameraError, setCameraError] = useState('');
  const [defaults, setDefaults] = useState({ game: '', condition: '', printing: '' });
  const [soundOn, setSoundOn] = useState(true);
  const [flashKey, setFlashKey] = useState(0);
  const videoRef = useRef(null);
  const guideRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const cameraFileRef = useRef(null);
  const inFlight = useRef(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Restore this device's stack (it survives a refresh or the phone
  // sleeping). Cards that were mid-recognition get picked up again by the
  // queue below, since nothing is in flight after a reload.
  useEffect(() => {
    let cancelled = false;
    loadStack(storageKey).then((saved) => {
      if (cancelled) return;
      // Merge, don't replace — anything captured before the saved stack
      // finished loading (a quick first tap) must not be wiped out by it.
      setItems(prev => {
        const have = new Set(prev.map(i => i.id));
        return [...prev, ...saved.filter(i => !have.has(i.id))];
      });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveStack(storageKey, items), 400);
    return () => clearTimeout(t);
  }, [items, loaded, storageKey]);

  function patchItem(id, patch) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }

  // A card the model couldn't read still needs a full, editable review row
  // (blank name for staff to type, its own photo kept), not a bare capture.
  function markFailed(item, message) {
    setItems(prev => prev.map(i => (i.id === item.id ? {
      ...detectedToRow({ confidence: 'low' }),
      id: i.id, capturedAt: i.capturedAt, sessionDefaults: i.sessionDefaults, qty: i.qty || 1,
      photoData: i.photoData, photoUrl: 'local', activeImage: 'photo', imageStatus: 'none',
      ...(i.sessionDefaults && i.sessionDefaults.game ? { game: i.sessionDefaults.game } : {}),
      status: 'failed', recognitionError: message,
    } : i)));
  }

  async function recognize(item) {
    inFlight.current.add(item.id);
    try {
      const detected = await scanBinderPage(item.photoData);
      const card = detected.find(c => c && c.name) || null;
      if (!card) {
        markFailed(item, "Couldn't recognize this card.");
        return;
      }
      const d = item.sessionDefaults || {};
      const row = {
        ...detectedToRow(card),
        id: item.id,
        capturedAt: item.capturedAt,
        status: 'ready',
        qty: item.qty || 1,
        // The capture is already just this card — it IS the real photo, no
        // bbox crop needed (unlike a binder page).
        photoData: item.photoData,
        photoUrl: 'local',
        activeImage: 'photo',
      };
      // Session defaults set before scanning (ManaBox's "set this up
      // first" bottom menu). A chosen Game overrides the model's guess;
      // Condition/Printing only fill what the scan left blank (it never
      // guesses those anyway).
      if (d.game) row.game = d.game;
      if (d.condition && !row.condition) row.condition = d.condition;
      if (d.printing && !row.printing) row.printing = d.printing;

      // Same card already in the stack (same name + number, same rule as
      // the binder scanner's mergeScanDuplicates)? Bump its quantity
      // instead of adding a second row.
      const key = scanDuplicateKey(row);
      const dupe = key && itemsRef.current.find(o => o.id !== row.id && o.status === 'ready' && scanDuplicateKey(o) === key);
      if (dupe) {
        setItems(prev => prev
          .filter(o => o.id !== row.id)
          .map(o => (o.id === dupe.id ? { ...o, qty: (o.qty || 1) + (row.qty || 1) } : o)));
        toast(`Another ${row.name} — now ×${(dupe.qty || 1) + (row.qty || 1)}`);
        return;
      }

      setItems(prev => prev.map(o => (o.id === row.id ? row : o)));
      const results = await findImageCandidates(row.name, row.game, row.set, row.rarity, row.number);
      patchItem(row.id, {
        imageUrl: results[0]?.url || '', imageStatus: results.length ? 'found' : 'none', imageCandidates: results,
        pendingPrice: results[0]?.price ?? null, pendingListingUrl: results[0]?.listingUrl || '',
      });
    } catch (err) {
      markFailed(item, 'Recognition failed: ' + (err.message || 'unknown error'));
    } finally {
      inFlight.current.delete(item.id);
      // Nudge the queue to pick up the next waiting card.
      setItems(prev => prev.slice());
    }
  }

  // The background queue: oldest waiting card first, a couple at a time.
  useEffect(() => {
    if (!loaded) return;
    const free = RECOGNITION_CONCURRENCY - inFlight.current.size;
    if (free <= 0) return;
    const waiting = items.filter(i => i.status === 'recognizing' && !inFlight.current.has(i.id)).reverse();
    waiting.slice(0, free).forEach(recognize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loaded]);

  function addCapture(photoData) {
    const item = {
      id: newStackId(), status: 'recognizing', photoData, photoUrl: 'local', activeImage: 'photo',
      qty: 1, capturedAt: Date.now(), sessionDefaults: { ...defaults },
    };
    setItems(prev => [item, ...prev]);
    setFlashKey(k => k + 1);
    try { navigator.vibrate?.(40); } catch { /* no haptics */ }
    if (soundOn) playScanBeep();
  }

  // --- Camera ---------------------------------------------------------
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('error');
      setCameraError("This browser can't open a live camera here — use Take photo instead.");
      return;
    }
    setCamera('starting');
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera('on');
    } catch (err) {
      setCamera('error');
      setCameraError(err && err.name === 'NotAllowedError'
        ? 'Camera permission was denied — allow it in the browser settings, or use Take photo instead.'
        : "Couldn't start the camera — use Take photo instead.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(c => (c === 'error' ? c : 'off'));
  }

  // Never leave the camera running in the background: stop it when the
  // page is hidden, when this tab/mode stops being displayed (every app tab
  // stays mounted, just hidden), and on unmount.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onVisibility);
    let io = null;
    if (typeof IntersectionObserver !== 'undefined' && boxRef.current) {
      io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting && entry.target.getClientRects().length === 0) stopCamera();
      });
      io.observe(boxRef.current);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (io) io.disconnect();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function captureFromCamera() {
    const video = videoRef.current;
    if (camera !== 'on' || !video || video.readyState < 2 || !guideRef.current) return;
    try {
      addCapture(captureGuideFromVideo(video, guideRef.current));
    } catch (err) {
      toast("Couldn't capture — " + (err.message || 'try again'), true);
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        addCapture(await resizeImageFile(file, 1024, 0.85));
      } catch (err) {
        toast(err.message, true);
      }
    }
  }

  async function clearStack() {
    if (!items.length) return;
    if (!(await showConfirm(`Clear all ${items.length} card(s) from the stack? Nothing is added to the ${destinationLabel}.`))) return;
    setItems([]);
  }

  const recognizingCount = items.filter(i => i.status === 'recognizing').length;
  const totalQty = items.reduce((n, i) => n + (Number(i.qty) || 1), 0);
  const last = items[0];
  const printingOptions = defaults.game ? (PRINTING_OPTIONS_BY_GAME[defaults.game] || []) : [];

  function renderRow(row, i, defaultRow) {
    if (row.status === 'recognizing') {
      return (
        <div className="scan-row stack-pending-row" key={row.id}>
          <div className="scan-row-thumb" onClick={() => openLightbox(row.photoData)} style={{ cursor: 'pointer' }}>
            {row.photoData && <img src={row.photoData} alt="Captured card" />}
          </div>
          <div className="status-line" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span className="spinner" /> Recognizing…
          </div>
          <button className="icon-btn" title="Remove" onClick={() => setItems(prev => prev.filter(o => o.id !== row.id))}>✕</button>
        </div>
      );
    }
    if (row.status === 'failed') {
      return (
        <div key={row.id} className="stack-failed-row">
          <div className="stack-failed-note">
            {row.recognitionError || "Couldn't recognize this card."} Fill it in below, or{' '}
            <button type="button" className="btn ghost small" onClick={() => patchItem(row.id, { status: 'recognizing', recognitionError: '' })}>
              Retry
            </button>
          </div>
          {defaultRow(row, i)}
        </div>
      );
    }
    return defaultRow(row, i);
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: '16px' }}>
        <div className="section-label">Scan a stack</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
          Hold one card inside the frame and tap to capture — it goes straight into the stack and gets identified
          in the background while you scan the next one. Scanning the same card again adds to its quantity. Review the
          stack below, then add everything to the {destinationLabel} at once. The stack is kept on this device until then.
        </div>

        <div className="stack-camera" ref={boxRef} onClick={captureFromCamera} role={camera === 'on' ? 'button' : undefined}
          aria-label={camera === 'on' ? 'Capture card' : undefined}>
          <video ref={videoRef} playsInline muted autoPlay style={{ display: camera === 'on' || camera === 'starting' ? 'block' : 'none' }} />
          {(camera === 'on' || camera === 'starting') && (
            <div className="stack-guide" ref={guideRef} style={{ aspectRatio: String(CARD_ASPECT) }} />
          )}
          {camera === 'on' && <div key={flashKey} className={flashKey ? 'stack-flash' : ''} />}
          {camera === 'starting' && <div className="stack-camera-msg">Starting camera…</div>}
          {(camera === 'off' || camera === 'error') && (
            <div className="stack-camera-msg">
              {camera === 'error' ? cameraError : 'The camera opens here.'}
              <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={(e) => { e.stopPropagation(); startCamera(); }}>
                Start camera
              </button>
            </div>
          )}
          {camera === 'on' && (
            <>
              <div className="stack-camera-hint">Tap anywhere to capture</div>
              <div className="stack-counter">
                {items.length} in stack{recognizingCount ? ` · ${recognizingCount} recognizing` : ''}
              </div>
              {last && (
                <div className="stack-last" onClick={(e) => e.stopPropagation()}>
                  {last.photoData && <img src={last.photoData} alt="" />}
                  <span>{last.status === 'recognizing' ? 'Recognizing…' : (last.name || 'Not recognized')}{last.qty > 1 ? ` ×${last.qty}` : ''}</span>
                </div>
              )}
              <button
                type="button" className="btn secondary small stack-stop"
                onClick={(e) => { e.stopPropagation(); stopCamera(); }}
              >Stop camera</button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          <button type="button" className="btn secondary small" onClick={() => cameraFileRef.current.click()}>Take photo</button>
          <button type="button" className="btn secondary small" onClick={() => fileRef.current.click()}>Upload photos</button>
          <label className="checkbox-row" style={{ marginBottom: 0, marginLeft: 'auto' }}>
            <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
            <span className="checkbox-label-plain">Scan sound</span>
          </label>
        </div>
        {/* Fallbacks for when a live camera isn't available or allowed: the
            OS camera (one card per photo) or several existing photos at once. */}
        <input type="file" ref={cameraFileRef} accept="image/*" capture="environment" style={{ display: 'none' }}
          aria-label="Take a photo of one card"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        <input type="file" ref={fileRef} accept="image/*" multiple style={{ display: 'none' }}
          aria-label="Upload card photos"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

        <div className="stack-defaults">
          <div className="field-group">
            <label htmlFor="stack_game">Game</label>
            <select id="stack_game" value={defaults.game}
              onChange={(e) => setDefaults(d => ({ ...d, game: e.target.value, printing: '' }))}>
              <option value="">Detect automatically</option>
              {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="stack_condition">Condition</label>
            <select id="stack_condition" value={defaults.condition} onChange={(e) => setDefaults(d => ({ ...d, condition: e.target.value }))}>
              <option value="">Set per card</option>
              {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {printingOptions.length > 0 && (
            <div className="field-group">
              <label htmlFor="stack_printing">Printing / finish</label>
              <select id="stack_printing" value={defaults.printing} onChange={(e) => setDefaults(d => ({ ...d, printing: e.target.value }))}>
                <option value="">Set per card</option>
                {printingOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
          Applied to each card as it's scanned — change them between cards as you go.
        </div>
      </div>

      {items.length > 0 && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-soft)', marginRight: 'auto' }}>
              {totalQty} card{totalQty === 1 ? '' : 's'} total
            </span>
            <button type="button" className="btn ghost small" onClick={clearStack}>Clear stack</button>
          </div>
          <ScanReview
            rows={items}
            setRows={setItems}
            catalog={catalog}
            locations={locations}
            multipliers={multipliers}
            onImport={onImport}
            onAdded={() => setItems([])}
            destinationLabel={destinationLabel}
            title="Stack"
            locationLabel="Binder / case / collection for this stack"
            addedMessage={(n) => `Added ${n} item(s) from the stack`}
            confirmBlockedReason={recognizingCount ? `Waiting for ${recognizingCount} card(s) to be recognized…` : null}
            renderRow={renderRow}
            idPrefix="st"
          />
        </div>
      )}
    </div>
  );
}
