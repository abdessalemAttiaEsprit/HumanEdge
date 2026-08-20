import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { publicJobsApi } from '@/api/publicJobs';
import { PublicNavbar } from '@/components/PublicNavbar';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['public-jobs'],
    queryFn: () => publicJobsApi.list(6),
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const FEATURES = [
    { image: '/assets/feature-recruiting.jpg', icon: '🤖', title: t.home.feature1Title, text: t.home.feature1Text },
    { image: '/assets/feature-hr.jpg', icon: '🗂️', title: t.home.feature2Title, text: t.home.feature2Text },
    { image: '/assets/feature-payroll.jpg', icon: '💳', title: t.home.feature3Title, text: t.home.feature3Text },
    { image: '/assets/feature-security.jpg', icon: '🔒', title: t.home.feature4Title, text: t.home.feature4Text },
  ];

  return (
    <div className="landing">
      <PublicNavbar />

      {/* ------------------------------ Hero ------------------------------ */}
      <section id="home" className="hero">
        <div className="hero__content">
          <span className="hero__eyebrow">{t.home.eyebrow}</span>
          <h1>{t.home.heroTitle}</h1>
          <p>{t.home.heroSubtitle}</p>
          <div className="hero__actions">
            <Link to="/register/company" className="btn btn--primary btn--lg">
              {t.home.getStarted}
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              {t.home.signIn}
            </Link>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="mock-card">
            <div className="mock-card__row mock-card__row--header">
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-dot" />
            </div>
            <div className="mock-stats">
              <div className="mock-stat">
                <span className="mock-stat__value">128</span>
                <span className="mock-stat__label">{t.home.mockEmployees}</span>
              </div>
              <div className="mock-stat">
                <span className="mock-stat__value">32</span>
                <span className="mock-stat__label">{t.home.mockOpenRoles}</span>
              </div>
              <div className="mock-stat">
                <span className="mock-stat__value">94%</span>
                <span className="mock-stat__label">{t.home.mockAiScore}</span>
              </div>
            </div>
            <div className="mock-bars">
              <span className="mock-bar" style={{ width: '86%' }} />
              <span className="mock-bar" style={{ width: '62%' }} />
              <span className="mock-bar" style={{ width: '74%' }} />
              <span className="mock-bar" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------- Why choose HumanEdge -------------------- */}
      <section id="why" className="why">
        <div className="section-header">
          <span className="section-header__eyebrow">{t.home.whyEyebrow}</span>
          <h2>{t.home.whyTitle}</h2>
        </div>

        <div className="why__grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-card__photo">
                <img src={f.image} alt="" />
                <span className="feature-card__icon">{f.icon}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ Proof band -------------------------- */}
      <div className="proof-band">
        <img src="/assets/proof-team.jpg" alt="Team using HumanEdge" />
      </div>

      {/* ---------------------------- Public jobs --------------------------- */}
      <section id="jobs" className="jobs">
        <div className="section-header">
          <span className="section-header__eyebrow">{t.home.jobsEyebrow}</span>
          <h2>{t.home.jobsTitle}</h2>
          <p>{t.home.jobsSubtitle}</p>
        </div>

        {isLoading && <p className="jobs__status">{t.home.loadingJobs}</p>}
        {isError && <p className="jobs__status">{t.home.errorJobs}</p>}
        {!isLoading && !isError && (jobs?.length ?? 0) === 0 && (
          <p className="jobs__status">{t.home.noJobs}</p>
        )}

        {(jobs?.length ?? 0) > 0 && (
          <div className="jobs__grid">
            {jobs!.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-card__top">
                  {job.jobType && (
                    <span className="job-card__type">{t.contractTypes[job.jobType]}</span>
                  )}
                  {job.department && <span className="job-card__dept">{job.department}</span>}
                </div>
                <h3>{job.title}</h3>
                {job.companyName && <p className="job-card__company">{job.companyName}</p>}
                {job.description && (
                  <p className="job-card__desc">{truncate(job.description, 110)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="jobs__cta">
          <Link to="/register/candidate" className="btn btn--primary">
            {t.home.applyCta}
          </Link>
        </div>
      </section>

      {/* -------------------------------- CTA band --------------------------- */}
      <section className="cta-band">
        <div className="cta-band__inner">
          <h2>{t.home.ctaTitle}</h2>
          <p>{t.home.ctaSubtitle}</p>
          <div className="cta-band__actions">
            <Link to="/register/company" className="btn btn--primary btn--lg">
              {t.home.getStartedFree}
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              {t.home.signIn}
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>{t.home.footer(new Date().getFullYear())}</span>
        <Link to="/privacy">{t.home.privacyLink}</Link>
      </footer>
    </div>
  );
}
