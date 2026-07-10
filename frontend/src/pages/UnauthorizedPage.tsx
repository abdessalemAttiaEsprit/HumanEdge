import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  return (
    <div className="status-page">
      <div className="status-page__code">403</div>
      <h1>Access denied</h1>
      <p>You do not have the required permissions to access this page.</p>
      <Link className="btn btn--primary" to="/dashboard">
        Back to dashboard
      </Link>
    </div>
  );
}
