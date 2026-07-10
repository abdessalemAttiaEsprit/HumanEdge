interface ModulePlaceholderPageProps {
  title: string;
  icon?: string;
}

/**
 * Generic "module coming soon" page. Serves as the target for navigation
 * entries until their dedicated CRUD screens are built.
 */
export function ModulePlaceholderPage({ title, icon }: ModulePlaceholderPageProps) {
  return (
    <div className="page">
      <div className="page__header">
        <h1>
          {icon && <span style={{ marginRight: 8 }}>{icon}</span>}
          {title}
        </h1>
        <p className="page__subtitle">This module will be implemented in a future step.</p>
      </div>
      <div className="placeholder-box">
        <span className="placeholder-box__badge">Under construction</span>
        <p>
          Navigation, role-based security, and the API layer are already in place.
          The management screens will be added here.
        </p>
      </div>
    </div>
  );
}
