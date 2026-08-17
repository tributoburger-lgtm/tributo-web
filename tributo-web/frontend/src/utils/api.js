import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: API_URL })

// Inyectar token en cada request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Si el token expira, redirigir al login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Helpers por módulo
export const authApi = {
  login: (username, password) => api.post('/api/auth/login', new URLSearchParams({ username, password })),
  me: () => api.get('/api/auth/me'),
}

export const productosApi = {
  listar: (params) => api.get('/api/productos/', { params }),
  obtener: (id) => api.get(`/api/productos/${id}`),
  crear: (data) => api.post('/api/productos/', data),
  actualizar: (id, data) => api.put(`/api/productos/${id}`, data),
  categorias: () => api.get('/api/productos/categorias/lista'),
}

export const ventasApi = {
  listar: (params) => api.get('/api/ventas/', { params }),
  obtener: (id) => api.get(`/api/ventas/${id}`),
  crear: (data) => api.post('/api/ventas/', data),
  anular: (id, motivo) => api.post(`/api/ventas/${id}/anular`, { motivo }),
}

export const inventarioApi = {
  stock: () => api.get('/api/inventario/stock'),
  kardex: (id, limit) => api.get(`/api/inventario/kardex/${id}`, { params: { limit } }),
}

export const cajaApi = {
  turnoActivo: () => api.get('/api/caja/turno/activo'),
  abrirTurno: (data) => api.post('/api/caja/turno/abrir', data),
  cerrarTurno: (id, data) => api.post(`/api/caja/turno/${id}/cerrar`, data),
  egreso: (data) => api.post('/api/caja/egreso', data),
  ingreso: (data) => api.post('/api/caja/ingreso', data),
  egresos: (params) => api.get('/api/caja/egresos', { params }),
}

export const reportesApi = {
  estadoResultados: (desde, hasta) => api.get('/api/reportes/estado-resultados', { params: { desde, hasta } }),
  ventasPorDia: (desde, hasta) => api.get('/api/reportes/ventas-por-dia', { params: { desde, hasta } }),
}

export const configApi = {
  tasas: () => api.get('/api/config/tasas'),
  config: () => api.get('/api/config/'),
}
