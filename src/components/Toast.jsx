export default function Toast({ msg, isErr, show, actionLabel, onAction }) {
  return (
    <div className={`toast${show ? ' show' : ''}`} style={{ background: isErr ? '#AE3B2E' : '#161F1B' }} role="status">
      {msg}
      {actionLabel && show && (
        <button type="button" className="toast-action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
