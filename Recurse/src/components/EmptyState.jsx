import Illustration from './Illustration'

export default function EmptyState({ icon: Icon, art, title, children, action }) {
  return (
    <div className="empty">
      {art ? (
        <Illustration name={art} />
      ) : (
        Icon && (
          <div className="empty-icon">
            <Icon size={24} />
          </div>
        )
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
