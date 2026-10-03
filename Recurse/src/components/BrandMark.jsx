/** Recurse mark: a loop that returns to its start, with a dot for the memory it keeps. */
export default function BrandMark({ size = 26, className = 'brand-mark' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M22.6 11.2A8 8 0 1 0 24 16" fill="none" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24.8 7.6v4.6h-4.6" fill="none" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.6" fill="var(--on-accent)" />
    </svg>
  )
}
