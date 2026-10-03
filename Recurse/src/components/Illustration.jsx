// Line illustrations in the app's catalog-card style: ink strokes on card stock,
// with the red catalog rule and cobalt ink as the only accents. Colors come from
// CSS variables, so every drawing follows the theme.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }
const CARD = { fill: 'var(--card)', stroke: 'currentColor', strokeWidth: 1.75, strokeLinejoin: 'round' }
const RED = { stroke: 'var(--rule-red)', strokeWidth: 1.5 }
const BLUE = { stroke: 'var(--rule-blue)', strokeWidth: 1.5 }

/** An index card with the red rule and a few ruled lines. */
function IndexCard({ x, y, w, h, lines = 3, tab, rotate = 0 }) {
  const cx = x + w / 2
  const cy = y + h / 2
  return (
    <g transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}>
      {tab && <rect x={x + w - tab.w - 8} y={y - 9} width={tab.w} height="12" rx="2" fill={tab.fill || 'var(--accent)'} stroke="currentColor" strokeWidth="1.75" />}
      <rect x={x} y={y} width={w} height={h} rx="3" {...CARD} />
      <line x1={x + 4} x2={x + w - 4} y1={y + 10} y2={y + 10} {...RED} />
      {Array.from({ length: lines }, (_, i) => (
        <line key={i} x1={x + 8} x2={x + w - 8 - (i === lines - 1 ? w * 0.3 : 0)} y1={y + 20 + i * 9} y2={y + 20 + i * 9} {...BLUE} />
      ))}
    </g>
  )
}

const drawings = {
  // A catalog drawer with cards standing in it, one lifted out.
  drawer: (
    <>
      <IndexCard x={46} y={34} w={58} h={44} lines={0} />
      <IndexCard x={96} y={30} w={58} h={48} lines={0} tab={{ w: 14, fill: 'var(--card-3)' }} />
      <IndexCard x={70} y={13} w={66} h={50} lines={3} tab={{ w: 16 }} rotate={-6} />
      <rect x="28" y="66" width="144" height="66" rx="4" {...CARD} />
      <line x1="28" x2="172" y1="76" y2="76" {...S} strokeWidth="1.2" opacity="0.5" />
      <rect x="82" y="88" width="36" height="16" rx="1.5" {...S} />
      <line x1="88" x2="112" y1="96" y2="96" {...BLUE} />
      <path d="M86 116 h28 a4 4 0 0 1 0 8 h-28 a4 4 0 0 1 0 -8z" {...S} />
      <line x1="20" x2="180" y1="132" y2="132" {...S} />
    </>
  ),
  // A squared-up stack of finished cards with a check stamp.
  done: (
    <>
      <IndexCard x={58} y={50} w={84} h={58} lines={0} />
      <IndexCard x={52} y={42} w={84} h={58} lines={0} />
      <IndexCard x={46} y={34} w={84} h={58} lines={3} />
      <g transform="rotate(-10 138 46)">
        <circle cx="138" cy="46" r="22" fill="var(--card)" stroke="var(--good)" strokeWidth="2" />
        <circle cx="138" cy="46" r="17.5" fill="none" stroke="var(--good)" strokeWidth="1" />
        <path d="M129 46 l6 6 l12 -13" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <line x1="30" x2="170" y1="118" y2="118" {...S} />
    </>
  ),
  // A card under a magnifying glass.
  search: (
    <>
      <IndexCard x={40} y={28} w={92} h={64} lines={4} />
      <circle cx="122" cy="78" r="22" fill="color-mix(in srgb, var(--card) 70%, transparent)" {...S} strokeWidth="2" />
      <circle cx="122" cy="78" r="15" fill="none" stroke="var(--accent)" strokeWidth="1.25" opacity="0.6" />
      <line x1="138" y1="94" x2="156" y2="112" {...S} strokeWidth="5" />
      <line x1="30" x2="170" y1="118" y2="118" {...S} />
    </>
  ),
  // A ruled card with a chart still to be drawn.
  chart: (
    <>
      <IndexCard x={36} y={24} w={128} h={86} lines={0} />
      <line x1="52" x2="52" y1="44" y2="98" {...S} />
      <line x1="52" x2="150" y1="98" y2="98" {...S} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={62 + i * 17} y={98 - [18, 30, 22, 40, 34][i]} width="10" height={[18, 30, 22, 40, 34][i]} rx="1.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 3" />
      ))}
      <path d="M136 34 l18 -18 l6 6 l-18 18 l-8 2z" fill="var(--card)" {...S} />
      <line x1="30" x2="170" y1="122" y2="122" {...S} />
    </>
  ),
  // A card that fell out of its drawer.
  lost: (
    <>
      <rect x="30" y="76" width="96" height="48" rx="4" {...CARD} />
      <path d="M62 100 h32 a4 4 0 0 1 0 8 h-32 a4 4 0 0 1 0 -8z" {...S} />
      <IndexCard x={104} y={34} w={62} h={44} lines={2} rotate={18} />
      <text x="136" y="70" textAnchor="middle" fontFamily="var(--font-display)" fontSize="26" fill="var(--accent)" transform="rotate(18 135 56)">?</text>
      <line x1="20" x2="180" y1="124" y2="124" {...S} />
    </>
  ),
  // A single card stamped as resolved.
  cleared: (
    <>
      <IndexCard x={44} y={30} w={100} h={68} lines={4} />
      <g transform="rotate(-8 118 80)">
        <rect x="92" y="68" width="58" height="22" rx="3" fill="var(--card)" stroke="var(--good)" strokeWidth="2" />
        <text x="121" y="83.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fontWeight="700" letterSpacing="1.5" fill="var(--good)">CLEAR</text>
      </g>
      <line x1="30" x2="170" y1="118" y2="118" {...S} />
    </>
  )
}

export default function Illustration({ name, className = 'illus', title }) {
  const drawing = drawings[name]
  if (!drawing) return null
  return (
    <svg className={className} viewBox="0 0 200 140" role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true} aria-label={title}>
      {drawing}
    </svg>
  )
}
