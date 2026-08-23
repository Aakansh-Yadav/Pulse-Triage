export default function TriageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex items-center gap-3 text-muted">
        <span className="live-dot h-2.5 w-2.5 rounded-full bg-teal" />
        <span className="text-sm font-medium">Opening Ava…</span>
      </div>
    </div>
  );
}
