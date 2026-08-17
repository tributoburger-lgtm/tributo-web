import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const res = await login(username, password)
    if (res.ok) navigate('/pos')
    else setError(res.error)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-yellow-400 tracking-widest">TRIBUTO</h1>
          <p className="text-zinc-500 text-sm mt-1 tracking-widest">SMASH BURGER · POS</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800">
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-400"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-400"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold py-3 rounded-lg transition-colors"
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
