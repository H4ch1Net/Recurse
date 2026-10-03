/**
 * Recurse mark: cards nested inside cards, each one tucked into the corner of the last.
 * Recursion drawn as an index card. "ink" sits on paper; "solid" is the app icon form.
 */
export default function BrandMark({ size = 28, tone = 'ink', className = 'brand-mark' }) {
  const solid = tone === 'solid'
  const stroke = solid ? 'var(--on-accent)' : 'currentColor'
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {solid && <rect width="32" height="32" rx="7" fill="var(--accent)" />}
      <rect x={solid ? 6 : 2} y={solid ? 6 : 2} width={solid ? 20 : 28} height={solid ? 20 : 28} rx={solid ? 3 : 4.5} fill="none" stroke={stroke} strokeWidth="2" />
      <rect x={solid ? 12.5 : 11} y={solid ? 12.5 : 11} width={solid ? 11.5 : 17} height={solid ? 11.5 : 17} rx="2.5" fill="none" stroke={stroke} strokeWidth="2" />
      <rect x={solid ? 17.5 : 18.5} y={solid ? 17.5 : 18.5} width={solid ? 4.5 : 7.5} height={solid ? 4.5 : 7.5} rx="1.5" fill={solid ? 'var(--on-accent)' : 'var(--accent)'} />
    </svg>
  )
}
