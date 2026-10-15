/**
 * A row of on-screen keys for touch screens, where Tab, the arrow keys and Ctrl do not exist.
 * keys: [{ label, title, onPress }]. Pressing a key keeps focus (and the phone keyboard) on the
 * input. The row is hidden where there is a mouse and a real keyboard (see .w-keys in activities.css).
 */
export function TouchKeys({ keys, label = 'Keys', className = '' }) {
  return (
    <div className={`w-keys${className ? ` ${className}` : ''}`} role="group" aria-label={label} style={{ '--keys': keys.length }}>
      {keys.map((k) => (
        <button
          key={k.title}
          type="button"
          className="w-key"
          title={k.title}
          aria-label={k.title}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={k.onPress}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}
