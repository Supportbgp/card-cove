import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Toast from '../components/Toast.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import Lightbox from '../components/Lightbox.jsx';

const UIContext = createContext(null);

export function useUI() {
  return useContext(UIContext);
}

export function UIProvider({ children }) {
  const [toastState, setToastState] = useState({ msg: '', isErr: false, show: false, action: null });
  const toastTimer = useRef(null);

  // opts.action = { label, onClick } adds a button to the toast (e.g. the
  // "Undo" after Mark sold) and keeps it up longer so there's time to tap
  // it. Toasts are still single-slot: a later toast replaces this one,
  // action and all.
  const toast = useCallback((msg, isErr, opts) => {
    const action = (opts && opts.action) || null;
    setToastState({ msg, isErr: !!isErr, show: true, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const duration = (opts && opts.duration) || (action ? 8000 : 2400);
    toastTimer.current = setTimeout(() => setToastState(s => ({ ...s, show: false, action: null })), duration);
  }, []);

  // One-shot: hide the toast first so a second tap can't fire the action twice.
  const runToastAction = useCallback(() => {
    const action = toastState.action;
    if (!action) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState(s => ({ ...s, show: false, action: null }));
    action.onClick();
  }, [toastState.action]);

  const [confirmState, setConfirmState] = useState(null);

  const showConfirm = useCallback((message, title, opts) => {
    return new Promise((resolve) => {
      setConfirmState({ message, title, requirePassword: !!(opts && opts.requirePassword), resolve });
    });
  }, []);

  const [lightboxUrl, setLightboxUrl] = useState(null);
  const openLightbox = useCallback((url) => { if (url) setLightboxUrl(url); }, []);
  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  const value = { toast, showConfirm, openLightbox };

  return (
    <UIContext.Provider value={value}>
      {children}
      <Toast msg={toastState.msg} isErr={toastState.isErr} show={toastState.show}
        actionLabel={toastState.action && toastState.action.label} onAction={runToastAction} />
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          title={confirmState.title}
          requirePassword={confirmState.requirePassword}
          onResolve={(result) => { confirmState.resolve(result); setConfirmState(null); }}
        />
      )}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={closeLightbox} />}
    </UIContext.Provider>
  );
}
