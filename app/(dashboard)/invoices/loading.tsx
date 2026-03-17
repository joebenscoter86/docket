export default function InvoicesLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded mb-6" />
      {/* Filter tabs skeleton */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-gray-200 rounded-md" />
        ))}
      </div>
      {/* Table rows skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-200 rounded-md" />
        ))}
      </div>
    </div>
  );
}
