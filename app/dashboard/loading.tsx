// Esqueleto mostrado mientras se carga el código de una sección
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-md bg-gray-200" />
        <div className="h-4 w-80 max-w-full rounded-md bg-gray-200/70" />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[116px] rounded-xl border bg-card" />
        ))}
      </div>
      <div className="h-[420px] rounded-xl border bg-card" />
    </div>
  );
}
