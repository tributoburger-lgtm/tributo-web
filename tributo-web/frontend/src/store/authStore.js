import { create } from 'zustand'
import { authApi } from '../utils/api'

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const res = await authApi.login(username, password)
      const { access_token, usuario } = res.data
      localStorage.setItem('token', access_token)
      set({ token: access_token, user: usuario, isLoading: false })
      return { ok: true }
    } catch (e) {
      set({ isLoading: false })
      return { ok: false, error: e.response?.data?.detail || 'Error de conexión' }
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null })
  },

  fetchMe: async () => {
    try {
      const res = await authApi.me()
      set({ user: res.data })
    } catch {
      localStorage.removeItem('token')
      set({ token: null, user: null })
    }
  }
}))
