/** Floating tooltip positioned inside a relatively-positioned chart wrapper. */
export default function Tooltip({ tip, width }) {
  if (!tip) return null;
  const flip = tip.x > width - 200;
  // Open upwards in the lower part of the chart so the tooltip isn't cut off.
  const above = tip.y > 140;
  return (
    <div
      className="tooltip"
      role="status"
      style={{ left: flip ? undefined : tip.x + 12, right: flip ? width - tip.x + 12 : undefined, top: above ? undefined : tip.y + 12, bottom: above ? `calc(100% - ${tip.y - 12}px)` : undefined }}
    >
      <div className="tooltip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="tooltip-row" key={r.label}>
          {r.color && <span className="swatch" style={{ background: r.color }} />}
          <span className="tooltip-label">{r.label}</span>
          <span className="tooltip-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
