export default function Lightbox({ url, onClose }) {
  return (
    <div className="overlay show lightbox" onClick={onClose}>
      <img
        src={url}
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain' }}
        alt=""
      />
    </div>
  );
}
