import { useState } from 'react';

export default function FileDrop({ onFile, onSample }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`drop ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
    >
      <p><strong>Drop your Excel sleep log here</strong> or</p>
      <div className="actions">
        <label className="button primary">
          Choose file
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
          />
        </label>
        <button type="button" className="button" onClick={onSample}>Try the sample data</button>
        <a className="button ghost" href="sample-sleep-log.xlsx" download>Download template</a>
      </div>
      <p className="hint">
        Columns: <code>Date</code>, <code>Fell asleep</code>, <code>Woke up</code>, optional <code>Type</code> (Night / Nap),
        <code>Settling start</code>, <code>How fell asleep</code>, <code>Mood after</code> and <code>Notes</code> — or the
        sleep-consultant template. Use the evening's date for the whole night, even after midnight.
        Your file stays in your browser and is never uploaded.
      </p>
    </div>
  );
}
