import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { publicJobsApi } from '@/api/publicJobs';
import { PublicNavbar } from '@/components/PublicNavbar';
import type { TypeContrat } from '@/types';

const JOB_TYPE_LABEL: Record<TypeContrat, string> = {
  CDI: 'Permanent',
  CDD: 'Fixed-term',
  CDD_AI: 'Fixed-term (AI)',
  PROJET: 'Project-based',
  INTERIM: 'Temp / Interim',
  APPRENTISSAGE: 'Apprenticeship',
  STAGE: 'Internship',
  CONVENTION: 'Agreement',
};

const FEATURES = [
  {
    image: '/assets/feature-recruiting.jpg',
    icon: '🤖',
    title: 'AI-powered recruiting',
    text: 'Automatic application scoring and feedback, so a strong candidate never slips through the cracks.',
  },
  {
    image: '/assets/feature-hr.jpg',
    icon: '🗂️',
    title: 'Centralized HR management',
    text: 'Personnel, contracts, absences and documents in one place, accessible to your whole team.',
  },
  {
    image: '/assets/feature-payroll.jpg',
    icon: '💳',
    title: 'Effortless payroll',
    text: 'Grid-based salary suggestions, automatic calculations, and pay slips generated in one click.',
  },
  {
    image: '/assets/feature-security.jpg',
    icon: '🔒',
    title: 'Role-based security',
    text: 'Every user only sees what concerns them: company, employee, or candidate, under strict permissions.',
  },
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function HomePage() {
  const { isAuthenticated } = useAuth();

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['public-jobs'],
    queryFn: () => publicJobsApi.list(6),
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <PublicNavbar />

      {/* ------------------------------ Hero ------------------------------ */}
      <section id="home" className="hero">
        <div className="hero__content">
          <span className="hero__eyebrow">All-in-one HR platform</span>
          <h1>Simplify HR management and recruitment for your company</h1>
          <p>
            HumanEdge brings personnel, contracts, absences, payroll, and AI-powered recruiting
            together in one secure workspace.
          </p>
          <div className="hero__actions">
            <Link to="/register/company" className="btn btn--primary btn--lg">
              Get Started — Create my company workspace
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              Sign in
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
                <span className="mock-stat__label">Employees</span>
              </div>
              <div className="mock-stat">
                <span className="mock-stat__value">32</span>
                <span className="mock-stat__label">Open roles</span>
              </div>
              <div className="mock-stat">
                <span className="mock-stat__value">94%</span>
                <span className="mock-stat__label">Avg. AI score</span>
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
          <span className="section-header__eyebrow">Why HumanEdge</span>
          <h2>A platform built for modern HR teams</h2>
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
          <span className="section-header__eyebrow">Opportunities</span>
          <h2>Job openings from our partner companies</h2>
          <p>Discover open positions at companies hiring on HumanEdge.</p>
        </div>

        {isLoading && <p className="jobs__status">Loading job openings…</p>}
        {isError && (
          <p className="jobs__status">
            Unable to load job openings right now. Please try again later.
          </p>
        )}
        {!isLoading && !isError && (jobs?.length ?? 0) === 0 && (
          <p className="jobs__status">No open positions right now. Check back soon!</p>
        )}

        {(jobs?.length ?? 0) > 0 && (
          <div className="jobs__grid">
            {jobs!.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-card__top">
                  {job.jobType && (
                    <span className="job-card__type">{JOB_TYPE_LABEL[job.jobType]}</span>
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
            Create a candidate profile to apply
          </Link>
        </div>
      </section>

      {/* -------------------------------- CTA band --------------------------- */}
      <section className="cta-band">
        <div className="cta-band__inner">
          <h2>Ready to simplify HR for your company?</h2>
          <p>
            Create your workspace in minutes and start posting jobs, managing contracts, and
            running payroll — all in one place.
          </p>
          <div className="cta-band__actions">
            <Link to="/register/company" className="btn btn--primary btn--lg">
              Get started free
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} HumanEdge. All rights reserved.</span>
      </footer>
    </div>
  );
}
