/** Placeholder until the fields renderer lands: the spec as readable text. */
export default function Fields({ spec }) {
  return <pre className="visual-pending small">{JSON.stringify(spec, null, 1)}</pre>
}
