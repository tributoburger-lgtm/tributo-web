import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  ShoppingCart, UtensilsCrossed, Package, Wallet,
  BarChart2, ShoppingBag, Users, LogOut, ChevronDown, Building2, Check, ChefHat, Receipt
} from 'lucide-react'

// Cada item de nav esta atado a un codigo de modulo — si la empresa
// activa no tiene ese modulo prendido en empresa_modulos, no aparece.
const NAV = [
  { to: '/pos',        icon: ShoppingCart,    label: 'POS',         modulo: 'POS' },
  { to: '/restaurant', icon: UtensilsCrossed, label: 'Restaurant',  modulo: 'RESTAURANT' },
  { to: '/ventas',     icon: Receipt,         label: 'Ventas',      modulo: 'VENTAS' },
  { to: '/inventario', icon: Package,         label: 'Inventario',  modulo: 'INVENTARIO' },
  { to: '/recetas',    icon: ChefHat,         label: 'Recetas',     modulo: 'RECETAS' },
  { to: '/caja',       icon: Wallet,          label: 'Caja',        modulo: 'CAJA' },
  { to: '/reportes',   icon: BarChart2,       label: 'Reportes',    modulo: 'REPORTES' },
  { to: '/compras',    icon: ShoppingBag,     label: 'Compras',     modulo: 'COMPRAS' },
  { to: '/clientes',   icon: Users,           label: 'Clientes',    modulo: 'CLIENTES' },
]

function EmpresaSwitcher() {
  const { empresaActual, empresasDisponibles, cambiarEmpresa } = useAuthStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (!empresaActual) return null

  const handleSelect = async (id) => {
    if (id === empresaActual.id) { setOpen(false); return }
    const res = await cambiarEmpresa(id)
    setOpen(false)
    if (res.ok) navigate('/pos')
  }

  return (
    <div className="relative px-2 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-left transition-colors"
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: empresaActual.color || '#F5A623' }}
        />
        <span className="hidden md:block flex-1 text-xs font-semibold text-zinc-200 truncate">
          {empresaActual.nombre}
        </span>
        <ChevronDown size={14} className="hidden md:block text-zinc-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {empresasDisponibles.map(e => (
            <button
              key={e.id}
              onClick={() => handleSelect(e.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-700 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color || '#F5A623' }} />
              <span className="flex-1 text-xs text-zinc-200 truncate">{e.nombre}</span>
              {e.id === empresaActual.id && <Check size={14} className="text-yellow-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, logout, modulos, empresasDisponibles } = useAuthStore()
  const navItems = NAV.filter(item => modulos.includes(item.modulo))

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

        {/* Selector de empresa — solo se muestra si tiene acceso a mas de 1 */}
        {empresasDisponibles.length > 1 && (
          <div className="pt-3 border-b border-zinc-800 pb-1">
            <EmpresaSwitcher />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
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
