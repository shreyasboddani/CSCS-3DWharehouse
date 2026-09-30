import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { FoundationPage } from './pages/FoundationPage'
import { SetupPlaceholderPage } from './pages/SetupPlaceholderPage'
import { NotFoundPage } from './pages/NotFoundPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <FoundationPage /> },
      { path: 'setup', element: <SetupPlaceholderPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
