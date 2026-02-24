export function StagingBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-8 bg-amber-400 flex items-center justify-center">
      <span className="text-xs font-bold text-amber-900 tracking-wide uppercase">
        ⚠ Staging Environment
      </span>
    </div>
  );
}
