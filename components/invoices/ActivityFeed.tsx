import type { ActivityEvent } from "@/lib/invoices/activity";

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const EVENT_LABELS: Record<ActivityEvent["type"], string> = {
  uploaded: "uploaded",
  edited: "edited",
  approved: "approved",
  synced: "synced to",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventDescription(event: ActivityEvent): string {
  const label = EVENT_LABELS[event.type];
  if (event.type === "edited" && event.detail) {
    return `edited ${event.detail}`;
  }
  if (event.type === "synced" && event.detail) {
    const providerName = event.detail === "quickbooks" ? "QBO" : "Xero";
    return `synced to ${providerName}`;
  }
  return label;
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
        Activity
      </h3>
      <ul className="space-y-2">
        {events.map((event, i) => (
          <li key={i} className="flex items-baseline justify-between text-sm">
            <span className="text-secondary">
              <span className="font-medium text-primary">
                {event.userEmail ?? "Unknown user"}
              </span>
              {" "}
              {formatEventDescription(event)}
            </span>
            <span className="text-xs text-muted ml-4 whitespace-nowrap">
              {formatDate(event.timestamp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
