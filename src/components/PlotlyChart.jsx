import { useEffect, useRef, useState } from 'react';

let plotlyPromise;
// Plotly is large, so load it on first use instead of with the page.
const loadPlotly = () => (plotlyPromise ??= import('plotly.js-cartesian-dist-min').then((m) => m.default ?? m));

const CONFIG = {
  responsive: true,
  displaylogo: false,
  displayModeBar: 'hover',
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d', 'toggleSpikelines'],
};

/** Card with a title and a Plotly chart. */
export default function PlotlyChart({ title, subtitle, data, layout, height = 320, ariaLabel }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPlotly()
      .then((Plotly) => alive && ref.current && Plotly.react(ref.current, data, { ...layout, height }, CONFIG))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [data, layout, height]);

  useEffect(() => {
    const el = ref.current;
    return () => { if (el && plotlyPromise) plotlyPromise.then((Plotly) => Plotly.purge(el)); };
  }, []);

  return (
    <figure className="card">
      <figcaption>
        <h2>{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </figcaption>
      {failed
        ? <p className="error">The chart library could not be loaded.</p>
        : <div ref={ref} className="plot" style={{ minHeight: height }} role="img" aria-label={ariaLabel ?? title} />}
    </figure>
  );
}
