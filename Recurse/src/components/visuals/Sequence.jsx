/** Placeholder until the sequence renderer lands: the spec as readable text. */
export default function Sequence({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
