import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { AuthLayout } from '@/components/AuthLayout';

export function RegisterChooserPage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthLayout>
      <h1>Create an account</h1>
      <p className="auth-shell__subtitle">Choose the type of account you want to create.</p>

      <div className="account-choice">
        <Link to="/register/company" className="account-choice__card">
          <span className="account-choice__icon">🏢</span>
          <span className="account-choice__title">I&apos;m a company</span>
          <span className="account-choice__desc">
            Manage personnel, contracts, payroll and recruitment.
          </span>
        </Link>

        <Link to="/register/candidate" className="account-choice__card">
          <span className="account-choice__icon">🧑‍💼</span>
          <span className="account-choice__title">I&apos;m a candidate</span>
          <span className="account-choice__desc">Browse job openings and apply.</span>
        </Link>
      </div>

      <p className="auth-shell__footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
