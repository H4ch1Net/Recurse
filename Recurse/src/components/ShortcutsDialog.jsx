import Modal from './Modal'

const GROUPS = [
  {
    title: 'Anywhere',
    keys: [
      ['T', 'Go to Today'],
      ['P', 'Go to Paths'],
      ['X', 'Go to Practice'],
      ['L', 'Go to Library'],
      ['S', 'Go to Progress'],
      [',', 'Open Settings'],
      ['?', 'Show this list']
    ]
  },
  {
    title: 'Today and Library',
    keys: [
      ['R', 'Start the daily review'],
      ['/', 'Search the library']
    ]
  },
  {
    title: 'While studying',
    keys: [
      ['A to F', 'Choose an answer (toggle for select-all)'],
      ['1 to 9', 'Place the next step in an order question'],
      ['Enter', 'Submit, reveal, or continue'],
      ['1 to 4', 'Rate recall after answering: Again, Hard, Good, Easy'],
      ['E', 'Show the lesson excerpt'],
      ['Z or Ctrl+Z', 'Undo the last answer'],
      ['Esc', 'Leave the session']
    ]
  }
]

export default function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="stack">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="eyebrow">{group.title}</div>
            <div className="list">
              {group.keys.map(([key, label]) => (
                <div key={key} className="list-row">
                  <span className="grow">{label}</span>
                  <span className="kbd">{key}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
