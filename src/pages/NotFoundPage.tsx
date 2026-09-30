import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <section className="placeholder-page"><div className="eyebrow"><span className="eyebrow-line" />PAGE NOT FOUND</div><h1>This route is not set up.</h1><p>Return to the application foundation and continue from there.</p><Link className="text-link" to="/">Go to foundation <span aria-hidden="true">→</span></Link></section>
}
