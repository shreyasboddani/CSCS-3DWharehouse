import { Link } from 'react-router-dom'

export function SetupPlaceholderPage() {
  return <section className="placeholder-page"><div className="eyebrow"><span className="eyebrow-line" />ROUTE FOUNDATION</div><h1>Warehouse setup</h1><p>This route is reserved for the future setup flow. Product requirements and the persistence model should be agreed before warehouse data is collected here.</p><Link className="text-link" to="/">Return to foundation <span aria-hidden="true">→</span></Link></section>
}
