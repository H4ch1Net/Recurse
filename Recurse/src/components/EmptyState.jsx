export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={24} />
        </div>
      )}
      <h3 className="section-title">{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
