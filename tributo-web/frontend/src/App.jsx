import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'

// Pages
import Login from './pages/Login'
import Layout from './components/shared/Layout'
import POS from './pages/POS'
import Restaurant from './pages/Restaurant'
import Inventario from './pages/Inventario'
import Caja from './pages/Caja'
import Reportes from './pages/Reportes'
import Compras from './pages/Compras'
import Clientes from './pages/Clientes'
import Recetas from './pages/Recetas'
import Ventas from './pages/Ventas'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000 } } })

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { token, fetchMe } = useAuthStore()

  useEffect(() => {
    if (token) fetchMe()
  }, [token])

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/pos" replace />} />
            <Route path="pos"        element={<POS />} />
            <Route path="restaurant" element={<Restaurant />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="caja"       element={<Caja />} />
            <Route path="ventas"     element={<Ventas />} />
            <Route path="recetas"    element={<Recetas />} />
            <Route path="reportes"   element={<Reportes />} />
            <Route path="compras"    element={<Compras />} />
            <Route path="clientes"   element={<Clientes />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
