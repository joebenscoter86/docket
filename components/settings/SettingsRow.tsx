import type { ReactNode } from "react";

interface SettingsRowProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsRow({ title, description, children }: SettingsRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6 px-6 py-4">
      <div className="min-w-0 sm:max-w-[48%]">
        <p className="text-[13px] font-semibold text-text">{title}</p>
        {description && (
          <p className="text-[12px] text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 sm:max-w-[48%]">
        {children}
      </div>
    </div>
  );
}
