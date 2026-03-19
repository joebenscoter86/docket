interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-brand-lg bg-surface p-5 shadow-soft">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-brand-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-headings text-base font-bold text-text">{title}</h3>
        <p className="mt-1 font-body text-sm text-muted">{description}</p>
      </div>
    </div>
  )
}
