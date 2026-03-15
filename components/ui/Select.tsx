// Select component — implemented in DOC-5
export default function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props}>{children}</select>;
}
