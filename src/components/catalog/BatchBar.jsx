export default function BatchBar({ count, onMarkSold, onDuplicate, onDelete, onClear }) {
  return (
    <div className="batch-bar show">
      <span>{count} selected</span>
      <div className="spacer"></div>
      <button className="btn blue small" onClick={onMarkSold}>Mark sold</button>
      {count === 1 && (
        <button className="btn secondary small" onClick={onDuplicate}>Duplicate</button>
      )}
      <button className="btn danger small" onClick={onDelete}>Delete</button>
      <button className="btn ghost small" onClick={onClear}>Clear selection</button>
    </div>
  );
}
