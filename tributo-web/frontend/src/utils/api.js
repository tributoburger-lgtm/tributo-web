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
  cambiarEmpresa: (empresa_id) => api.post('/api/auth/cambiar-empresa', { empresa_id }),
}

export const productosApi = {
  listar: (params) => api.get('/api/productos/', { params }),
  obtener: (id) => api.get(`/api/productos/${id}`),
  crear: (data) => api.post('/api/productos/', data),
  actualizar: (id, data) => api.put(`/api/productos/${id}`, data),
  categorias: () => api.get('/api/productos/categorias/lista'),
  crearCategoria: (data) => api.post('/api/productos/categorias', data),
  actualizarCategoria: (id, data) => api.put(`/api/productos/categorias/${id}`, data),
  eliminarCategoria: (id) => api.delete(`/api/productos/categorias/${id}`),

  extras: () => api.get('/api/productos/extras/lista'),
  crearExtra: (data) => api.post('/api/productos/extras', data),
  eliminarExtra: (id) => api.delete(`/api/productos/extras/${id}`),
  asignarExtra: (productoId, extraId) => api.post(`/api/productos/${productoId}/extras/${extraId}`),
  quitarExtra: (productoId, extraId) => api.delete(`/api/productos/${productoId}/extras/${extraId}`),

  ingredientesVariante: (varianteId) => api.get(`/api/productos/variantes/${varianteId}/ingredientes`),
  guardarIngredientesVariante: (varianteId, data) => api.put(`/api/productos/variantes/${varianteId}/ingredientes`, data),
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
  valorizacion: () => api.get('/api/inventario/valorizacion'),
  ajustar: (data) => api.post('/api/inventario/ajuste', data),
  fraccionar: (data) => api.post('/api/inventario/fraccionar', data),
  fraccionamientos: () => api.get('/api/inventario/fraccionamientos'),
  revertirFraccionamiento: (id) => api.post(`/api/inventario/fraccionamientos/${id}/revertir`),
}

export const mermasApi = {
  listar: (params) => api.get('/api/mermas/', { params }),
  registrar: (data) => api.post('/api/mermas/', data),
}

export const recetasApi = {
  listar: () => api.get('/api/recetas/'),
  obtener: (productoId) => api.get(`/api/recetas/${productoId}`),
  guardar: (productoId, data) => api.put(`/api/recetas/${productoId}`, data),
  sincronizarCosto: (productoId) => api.post(`/api/recetas/${productoId}/sincronizar-costo`),
}

export const comprasApi = {
  listar: (params) => api.get('/api/compras/', { params }),
  obtener: (id) => api.get(`/api/compras/${id}`),
  crear: (data) => api.post('/api/compras/', data),
  recibir: (id, data) => api.post(`/api/compras/${id}/recibir`, data),
  anular: (id, motivo) => api.post(`/api/compras/${id}/anular`, { motivo }),
  proveedores: () => api.get('/api/compras/proveedores'),
  crearProveedor: (data) => api.post('/api/compras/proveedores', data),
}

export const clientesApi = {
  listar: (params) => api.get('/api/clientes/', { params }),
  obtener: (id) => api.get(`/api/clientes/${id}`),
  crear: (data) => api.post('/api/clientes/', data),
  actualizar: (id, data) => api.put(`/api/clientes/${id}`, data),
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

export const restaurantApi = {
  mesas: () => api.get('/api/restaurant/mesas'),
  abrir: (mesaId, data = {}) => api.post(`/api/restaurant/mesas/${mesaId}/abrir`, data),
  cuenta: (mesaId) => api.get(`/api/restaurant/mesas/${mesaId}/cuenta`),
  agregarItems: (mesaId, items) => api.post(`/api/restaurant/mesas/${mesaId}/items`, { items }),
  quitarItem: (mesaId, detalleId) => api.delete(`/api/restaurant/mesas/${mesaId}/items/${detalleId}`),
  cobrar: (mesaId, data) => api.post(`/api/restaurant/mesas/${mesaId}/cobrar`, data),
  liberar: (mesaId) => api.post(`/api/restaurant/mesas/${mesaId}/liberar`),

  pedidos: (incluirCerrados) => api.get('/api/restaurant/pedidos', { params: { incluir_cerrados: incluirCerrados } }),
  crearPedido: (data) => api.post('/api/restaurant/pedidos', data),
  cambiarEstadoPedido: (id, estado) => api.put(`/api/restaurant/pedidos/${id}/estado`, { estado }),
  cobrarPedido: (id, data) => api.post(`/api/restaurant/pedidos/${id}/cobrar`, data),
  anularPedido: (id, motivo) => api.post(`/api/restaurant/pedidos/${id}/anular`, { motivo }),
}

export const configApi = {
  tasas: () => api.get('/api/config/tasas'),
  config: () => api.get('/api/config/'),
}
