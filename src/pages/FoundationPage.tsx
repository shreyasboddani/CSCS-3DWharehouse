const foundations = [
  { number: '01', title: 'Application shell', detail: 'Shared navigation, responsive page frame, and routed screens.' },
  { number: '02', title: 'Typed frontend', detail: 'React and TypeScript with strict compiler checks.' },
  { number: '03', title: 'Service boundary', detail: 'API client structure keeps product screens separate from backend details.' },
]

export function FoundationPage() {
  return (
    <div className="page-stack">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-line" />PRODUCT FOUNDATION</div>
          <h1 id="welcome-title">A strong foundation for a warehouse twin.</h1>
          <p className="welcome-description">The SaaS frontend shell is ready. This is the base for the warehouse setup flow, configurable layout engine, shared operational views, and interactive 3D workspace.</p>
          <div className="welcome-meta"><span className="meta-check" aria-hidden="true">✓</span><span>Ready for product architecture</span></div>
        </div>
        <div className="warehouse-mark" aria-hidden="true">
          <div className="mark-orbit orbit-one" /><div className="mark-orbit orbit-two" />
          <div className="mark-building"><div className="building-roof" /><div className="building-body"><span /><span /><span /></div><div className="building-door" /></div>
          <div className="mark-node node-one" /><div className="mark-node node-two" /><div className="mark-node node-three" />
        </div>
      </section>
      <section className="section-block" aria-labelledby="base-title">
        <div className="section-heading"><div><div className="eyebrow">APPLICATION LAYERS</div><h2 id="base-title">Ready to build in clear boundaries</h2></div><p>Business workflows and persistent data will be added as deliberate features.</p></div>
        <div className="foundation-grid">{foundations.map((item) => <article className="foundation-card" key={item.number}><span className="card-number">{item.number}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
      </section>
      <section className="next-step-panel" aria-label="Implementation status"><span className="next-step-icon" aria-hidden="true">i</span><p><strong>Foundation only.</strong> Authentication, tenancy, warehouse records, billing, and generated 3D layouts are not implemented yet. No sample data is shown as customer data.</p></section>
    </div>
  )
}
