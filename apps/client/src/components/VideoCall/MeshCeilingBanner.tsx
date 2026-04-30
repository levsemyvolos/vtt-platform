/** Shown to all participants when active peer count reaches the mesh ceiling (N > 6). */
export default function MeshCeilingBanner(): JSX.Element {
  return (
    <div className="mesh-ceiling-banner" role="alert" aria-live="polite">
      <span className="mesh-ceiling-banner__icon" aria-hidden="true">⚠</span>
      Mesh ceiling reached — video disabled, audio only
    </div>
  );
}
