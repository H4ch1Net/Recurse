import Modal from './Modal'

const GROUPS = [
  {
    title: 'Anywhere',
    keys: [
      ['T', 'Go to Today'],
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
      ['A – D', 'Choose an answer'],
      ['Enter', 'Submit, reveal, or continue'],
      ['1 – 4', 'Rate recall: Again, Hard, Good, Easy'],
      ['E', 'Show the lesson excerpt'],
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
