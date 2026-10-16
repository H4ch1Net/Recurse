/** Placeholder until the tree renderer lands: the spec as readable text. */
export default function Tree({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
