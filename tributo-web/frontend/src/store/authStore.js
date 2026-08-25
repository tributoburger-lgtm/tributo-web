import { create } from 'zustand'
import { authApi } from '../utils/api'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  empresaActual: null,        // { id, nombre, color }
  empresasDisponibles: [],    // [{ id, nombre, color }]
  modulos: [],                // ['POS','RESTAURANT','CAJA', ...]

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const res = await authApi.login(username, password)
      const { access_token, usuario, empresa_actual, empresas_disponibles, modulos } = res.data
      localStorage.setItem('token', access_token)
      set({
        token: access_token,
        user: usuario,
        empresaActual: empresa_actual,
        empresasDisponibles: empresas_disponibles || [],
        modulos: modulos || [],
        isLoading: false
      })
      return { ok: true }
    } catch (e) {
      set({ isLoading: false })
      return { ok: false, error: e.response?.data?.detail || 'Error de conexión' }
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null, empresaActual: null, empresasDisponibles: [], modulos: [] })
  },

  fetchMe: async () => {
    try {
      const res = await authApi.me()
      set({
        user: res.data,
        empresaActual: res.data.empresa_actual,
        modulos: res.data.modulos || []
      })
    } catch {
      localStorage.removeItem('token')
      set({ token: null, user: null, empresaActual: null, empresasDisponibles: [], modulos: [] })
    }
  },

  cambiarEmpresa: async (empresaId) => {
    try {
      const res = await authApi.cambiarEmpresa(empresaId)
      const { access_token, usuario, empresa_actual, empresas_disponibles, modulos } = res.data
      localStorage.setItem('token', access_token)
      set({
        token: access_token,
        user: usuario,
        empresaActual: empresa_actual,
        empresasDisponibles: empresas_disponibles || [],
        modulos: modulos || [],
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || 'No se pudo cambiar de empresa' }
    }
  }
}))
