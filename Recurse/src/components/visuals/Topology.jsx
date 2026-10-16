/** Placeholder until the topology renderer lands: the spec as readable text. */
export default function Topology({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
