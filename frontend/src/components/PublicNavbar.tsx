import { Link } from 'react-router-dom';

export function PublicNavbar() {
  return (
    <header className="public-nav">
      <div className="public-nav__inner">
        <Link to="/" className="public-nav__brand">
          <img src="/assets/logo.png" alt="HumanEdge" />
        </Link>

        <nav className="public-nav__links">
          <a href="#why">Why us</a>
          <a href="#jobs">Job openings</a>
        </nav>

        <Link to="/login" className="btn btn--primary">
          Sign in
        </Link>
      </div>
    </header>
  );
}
