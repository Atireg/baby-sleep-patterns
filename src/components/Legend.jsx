export const SERIES = [
  { key: 'night', label: 'Night sleep', color: 'var(--series-1)' },
  { key: 'nap', label: 'Naps', color: 'var(--series-2)' },
];

export default function Legend() {
  return (
    <ul className="legend">
      {SERIES.map((s) => (
        <li key={s.key}>
          <span className="swatch" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
