import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="status-page">
      <div className="status-page__code">404</div>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has been moved.</p>
      <Link className="btn btn--primary" to="/">
        Back to home
      </Link>
    </div>
  );
}
