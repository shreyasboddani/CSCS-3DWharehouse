import { Link } from "react-router-dom";
export function Icon({ name = "box" }: { name?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : name === "arrow" ? (
        <path d="M4 12h16m-6-6 6 6-6 6" />
      ) : name === "grid" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : name === "activity" ? (
        <path d="m3 12 4-1 3-7 4 16 3-8h4" />
      ) : name === "link" ? (
        <>
          <path
            d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5m11 1 2-2a4 4 0 0 1 6 6l-5 5"
            transform="translate(2 0) scale(.85)"
          />
        </>
      ) : (
        <>
          <path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9" />
        </>
      )}
    </svg>
  );
}
export function Brand() {
  return (
    <Link to="/" className="brand">
      <img src="/cscs-logo.svg" alt="CSCS" />
      <span>
        Warehouse<span className="brand-light"> Twin</span>
      </span>
    </Link>
  );
}
