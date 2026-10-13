/** Sign-in status for the shared cloud log. */
export default function CloudBar({ user, count, busy, error, onSignIn, onSignOut }) {
  return (
    <section className={`cloud-bar ${user ? 'signed-in' : ''}`} aria-live="polite">
      {user === undefined && <span className="cloud-text">Checking sign-in…</span>}
      {user === null && (
        <>
          <span className="cloud-text">
            <strong>Keep your log in the cloud.</strong> Sign in to save sleeps once and see them on every device.
          </span>
          <button type="button" className="button primary" onClick={onSignIn} disabled={busy}>Sign in with Google</button>
        </>
      )}
      {user && (
        <>
          <span className="cloud-text">
            <span className="dot" aria-hidden="true" /> Shared log · {count} sleep{count === 1 ? '' : 's'} · signed in as {user.email}
          </span>
          <button type="button" className="button ghost" onClick={onSignOut}>Sign out</button>
        </>
      )}
      {error && <p className="error cloud-error" role="alert">{error}</p>}
    </section>
  );
}
