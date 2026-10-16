/** Placeholder until the cells renderer lands: the spec as readable text. */
export default function Cells({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
