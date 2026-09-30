# CSCS Warehouse Twin

A SaaS product foundation for a configurable warehouse layout and operational twin. This repository starts the React frontend and its application boundaries. It is not a demo build: production identity, tenant isolation, persistent records, billing, deployment, and integrations must be implemented and reviewed before the product is operated for customers.

## Frontend stack

- React 19 + TypeScript 6
- Vite 8
- React Router for application routes
- Zustand available for shared client state as feature work begins
- Three.js available for a future lazy, optional scene renderer
- CSS custom properties for design tokens
- Oxlint for linting

The backend and identity provider have not been selected here. The frontend uses an API client boundary configured with `VITE_API_BASE_URL`; it does not persist warehouse records locally or simulate a SCOTI connection.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

The current pages are foundation placeholders and do not require an API yet.

## Commands

```sh
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Source boundaries

- `src/app/` - route tree and shared shell
- `src/pages/` - route-level screens
- `src/shared/` - reusable UI and service helpers
- `src/shared/api/` - typed HTTP boundary
- `src/domain/` - future entities, invariants, and business rules
- `src/features/` - product feature modules
- `src/scene/` - future Three.js scene adapters
- `src/styles/` - design tokens and global styles

Keep business rules in the domain layer. UI components render state and dispatch explicit actions. The 3D scene is a view of layout and records, never the source of truth. Map scene hits to stable domain IDs.

## SaaS data and security principles

- Enforce tenant isolation and authorization on the server for every request; client-side tenant filters are not a security boundary.
- Do not put access tokens, customer records, or secrets in frontend source or browser local storage.
- Add login/session handling only after selecting an identity provider and server session model.
- Keep customer and operational data behind versioned API contracts and audit mutations at the service layer.
- Use synthetic data in local development until a secured backend and approved integration are available.

## Product boundary

This is an original warehouse operations product. It is not the production SCOTI interface and does not claim SCOTI API access. Any future SCOTI connection requires CSCS approval, supported API documentation, an approved test environment, field mapping, and explicit permissions.
