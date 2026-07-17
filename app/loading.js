export default function Loading() {
  return (
    <main className="site-main">
      <div className="site-shell loading-shell" aria-label="読み込み中" aria-busy="true">
        <div className="loading-line loading-line--title" />
        <div className="loading-grid">
          <div className="loading-panel loading-panel--main" />
          <div className="loading-panel" />
        </div>
        <div className="loading-strip">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="loading-tile" />)}
        </div>
      </div>
    </main>
  );
}
