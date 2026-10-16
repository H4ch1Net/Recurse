import { Inline } from '../RichText'

/**
 * Rows and columns. Wide boxes get a real table; on a narrow box a table of four or more
 * columns becomes one card per row (CSS container query), so nothing scrolls sideways.
 */
export default function Table({ spec }) {
  const { columns, rows } = spec
  const mono = new Set(spec.mono || [])
  const highlight = new Set(spec.highlight || [])
  const cardable = columns.length >= 4
  return (
    <div className={`v-table-wrap cols-${columns.length}${cardable ? ' cardable' : ''}`}>
      <div className="v-table-scroll">
        <table className="v-table">
          <thead>
            <tr>{columns.map((c, i) => <th key={i} scope="col"><Inline text={c} /></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={highlight.has(r) ? 'hi' : undefined}>
                {row.map((value, c) => {
                  const Tag = c === 0 ? 'th' : 'td'
                  return (
                    <Tag key={c} scope={c === 0 ? 'row' : undefined} className={mono.has(c) ? `mono${String(value).length > 16 ? ' long' : ''}` : undefined}>
                      <Inline text={String(value)} />
                    </Tag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cardable && (
        <ul className="v-table-cards">
          {rows.map((row, r) => (
            <li key={r} className={highlight.has(r) ? 'hi' : undefined}>
              <div className={`v-card-title${mono.has(0) ? ' mono' : ''}`}><Inline text={String(row[0])} /></div>
              <dl>
                {row.slice(1).map((value, i) => (
                  <div key={i}>
                    <dt><Inline text={columns[i + 1]} /></dt>
                    <dd className={mono.has(i + 1) ? 'mono' : undefined}><Inline text={String(value)} /></dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
