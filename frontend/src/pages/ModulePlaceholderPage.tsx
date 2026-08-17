import { useLanguage } from '@/i18n/useLanguage';

interface ModulePlaceholderPageProps {
  title: string;
  icon?: string;
}

/**
 * Generic "module coming soon" page. Serves as the target for navigation
 * entries until their dedicated CRUD screens are built.
 */
export function ModulePlaceholderPage({ title, icon }: ModulePlaceholderPageProps) {
  const { t } = useLanguage();
  return (
    <div className="page">
      <div className="page__header">
        <h1>
          {icon && <span style={{ marginRight: 8 }}>{icon}</span>}
          {title}
        </h1>
        <p className="page__subtitle">{t.modulePlaceholder.subtitle}</p>
      </div>
      <div className="placeholder-box">
        <span className="placeholder-box__badge">{t.modulePlaceholder.underConstruction}</span>
        <p>{t.modulePlaceholder.description}</p>
      </div>
    </div>
  );
}
