import { NavLink, Outlet } from 'react-router-dom'

function GridIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" /></svg>
}

function PlanIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" /><circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="10" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
}

export function AppShell() {
  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Warehouse Twin home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span className="brand-copy"><strong>Warehouse Twin</strong><small>OPERATIONS PLATFORM</small></span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="primary-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}><GridIcon /><span>Foundation</span></NavLink>
          <NavLink to="/setup" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}><PlanIcon /><span>Setup route</span></NavLink>
        </nav>
        <div className="sidebar-bottom"><span className="status-dot" aria-hidden="true" /><span>Development environment</span></div>
      </aside>
      <div className="workspace-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Warehouse Twin</span><span className="breadcrumb-separator">/</span><strong>Foundation</strong></div>
          <div className="environment-pill"><span className="status-dot" aria-hidden="true" />Product foundation</div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}><Outlet /></main>
        <footer className="app-footer"><span>Warehouse Twin</span><span>Operational data will be served through the application API</span></footer>
      </div>
    </div>
  )
}
