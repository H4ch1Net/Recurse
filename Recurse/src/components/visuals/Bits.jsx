/** Placeholder until the bits renderer lands: the spec as readable text. */
export default function Bits({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
