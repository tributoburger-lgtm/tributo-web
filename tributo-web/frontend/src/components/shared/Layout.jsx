import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  ShoppingCart, UtensilsCrossed, Package, Wallet,
  BarChart2, ShoppingBag, Users, LogOut
} from 'lucide-react'

const NAV = [
  { to: '/pos',        icon: ShoppingCart,    label: 'POS' },
  { to: '/restaurant', icon: UtensilsCrossed, label: 'Restaurant' },
  { to: '/inventario', icon: Package,         label: 'Inventario' },
  { to: '/caja',       icon: Wallet,          label: 'Caja' },
  { to: '/reportes',   icon: BarChart2,       label: 'Reportes' },
  { to: '/compras',    icon: ShoppingBag,     label: 'Compras' },
  { to: '/clientes',   icon: Users,           label: 'Clientes' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-zinc-800">
          <h1 className="hidden md:block text-xl font-black text-yellow-400 tracking-widest">TRIBUTO</h1>
          <div className="md:hidden w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <span className="text-zinc-900 font-black text-xs">T</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
                ${isActive
                  ? 'bg-yellow-400/10 text-yellow-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`
              }
            >
              <Icon size={18} />
              <span className="hidden md:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800">
          <div className="hidden md:block text-xs text-zinc-500 mb-2 px-2">
            {user?.nombre_completo}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 w-full transition-colors text-sm"
          >
            <LogOut size={16} />
            <span className="hidden md:block">Salir</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
