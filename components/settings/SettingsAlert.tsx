"use client";

interface SettingsAlertProps {
  type: "success" | "error";
  message: string;
}

export function SettingsAlert({ type, message }: SettingsAlertProps) {
  const styles =
    type === "success"
      ? "bg-accent/5 border-accent/20 text-accent"
      : "bg-error/5 border-error/20 text-error";

  const icon = type === "success" ? (
    <svg className="h-5 w-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    <svg className="h-5 w-5 text-error shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${styles}`}>
      {icon}
      <span>{message}</span>
    </div>
  );
}
