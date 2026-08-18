import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, ArrowDownCircle, ArrowUpCircle, LogOut, X, Receipt } from 'lucide-react'
import { cajaApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'

const METODOS_PAGO = [
  { value: 'EFECTIVO_USD', label: 'Efectivo USD' },
  { value: 'EFECTIVO_COP', label: 'Efectivo COP' },
  { value: 'BANCOLOMBIA_COP', label: 'Bancolombia' },
  { value: 'BINANCE', label: 'Binance' },
  { value: 'PAGO_MOVIL', label: 'Pago Móvil' },
  { value: 'ZELLE', label: 'Zelle' },
]

const CATEGORIAS_EGRESO = [
  { value: 'COMPRA', label: 'Compra / Insumos' },
  { value: 'SERVICIO', label: 'Servicio (luz, agua, internet)' },
  { value: 'NOMINA', label: 'Nómina' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
  { value: 'DIVIDENDO', label: 'Dividendo' },
  { value: 'ADELANTO_DIVIDENDO', label: 'Adelanto de dividendo' },
  { value: 'GASTO', label: 'Otro gasto' },
]

const CATEGORIAS_INGRESO = [
  { value: 'APORTE_SOCIO', label: 'Aporte de socio' },
  { value: 'PRESTAMO', label: 'Préstamo' },
  { value: 'OTRO', label: 'Otro ingreso' },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Caja() {
  const { token, user } = useAuthStore()
  const qc = useQueryClient()
  const [showAbrir, setShowAbrir] = useState(false)
  const [showCerrar, setShowCerrar] = useState(false)
  const [showEgreso, setShowEgreso] = useState(false)
  const [showIngreso, setShowIngreso] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['turno-activo', token],
    queryFn: () => cajaApi.turnoActivo().then(r => r.data),
    enabled: !!token
  })
  const turno = data?.turno || null

  const { data: movimientos = [] } = useQuery({
    queryKey: ['egresos', todayStr(), token],
    queryFn: () => cajaApi.egresos({ desde: todayStr(), hasta: todayStr() }).then(r => r.data),
    enabled: !!token && !!turno
  })
  const movimientosDelTurno = movimientos.filter(m => m.turno_id === turno?.id)
  const totalEgresos = movimientosDelTurno.reduce((s, m) => s + (m.monto_usd || 0), 0)

  if (isLoading) {
    return <div className="p-6 text-zinc-500">Cargando caja...</div>
  }

  if (!turno) {
    return (
      <div className="p-6 max-w-md">
        <h1 className="text-2xl font-bold text-yellow-400 mb-1">Caja</h1>
        <p className="text-zinc-500 text-sm mb-6">No tienes un turno abierto.</p>
        <button
          onClick={() => setShowAbrir(true)}
          className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          <Wallet size={18} /> Abrir turno
        </button>
        {showAbrir && <AbrirTurnoModal onClose={() => setShowAbrir(false)} onSuccess={() => {
          setShowAbrir(false)
          qc.invalidateQueries({ queryKey: ['turno-activo'] })
        }} />}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-yellow-400 mb-1">Caja</h1>
          <p className="text-zinc-500 text-sm">
            Turno abierto por {user?.nombre_completo || user?.username} · desde{' '}
            {turno.abierto_en ? new Date(turno.abierto_en).toLocaleString() : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCerrar(true)}
          className="bg-zinc-900 border border-red-900/50 text-red-400 hover:bg-red-900/20 font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2"
        >
          <LogOut size={16} /> Cerrar turno
        </button>
      </div>

      {/* Fondos iniciales */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase mb-1">Fondo inicial USD</p>
          <p className="text-white font-mono text-xl">$ {(turno.fondo_inicial_usd || 0).toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase mb-1">Fondo inicial COP</p>
          <p className="text-white font-mono text-xl">{(turno.fondo_inicial_cop || 0).toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase mb-1">Egresos hoy (USD)</p>
          <p className="text-red-400 font-mono text-xl">- $ {totalEgresos.toFixed(2)}</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setShowEgreso(true)}
          className="bg-zinc-900 border border-zinc-800 hover:border-red-900/50 rounded-xl p-4 flex items-center gap-3 text-left transition-colors"
        >
          <ArrowDownCircle className="text-red-400" size={24} />
          <div>
            <p className="text-white font-semibold text-sm">Registrar egreso</p>
            <p className="text-zinc-500 text-xs">Compras, servicios, nómina...</p>
          </div>
        </button>
        <button
          onClick={() => setShowIngreso(true)}
          className="bg-zinc-900 border border-zinc-800 hover:border-green-900/50 rounded-xl p-4 flex items-center gap-3 text-left transition-colors"
        >
          <ArrowUpCircle className="text-green-400" size={24} />
          <div>
            <p className="text-white font-semibold text-sm">Registrar ingreso</p>
            <p className="text-zinc-500 text-xs">Aportes, préstamos...</p>
          </div>
        </button>
      </div>

      {/* Movimientos del turno */}
      <div>
        <p className="text-zinc-500 text-xs uppercase mb-2 flex items-center gap-2">
          <Receipt size={14} /> Movimientos de este turno
        </p>
        {movimientosDelTurno.length === 0 ? (
          <p className="text-zinc-600 text-sm py-4">Sin movimientos registrados todavía.</p>
        ) : (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800 text-zinc-400 text-left">
                  <th className="px-4 py-2.5">Concepto</th>
                  <th className="px-4 py-2.5">Categoría</th>
                  <th className="px-4 py-2.5">Método</th>
                  <th className="px-4 py-2.5 text-right">Monto USD</th>
                </tr>
              </thead>
              <tbody>
                {movimientosDelTurno.map(m => (
                  <tr key={m.id} className="border-t border-zinc-800">
                    <td className="px-4 py-2.5 text-white">{m.concepto}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{m.categoria}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{m.metodo_pago || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-400">- $ {(m.monto_usd || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCerrar && (
        <CerrarTurnoModal
          turno={turno}
          onClose={() => setShowCerrar(false)}
          onSuccess={() => {
            setShowCerrar(false)
            qc.invalidateQueries({ queryKey: ['turno-activo'] })
          }}
        />
      )}
      {showEgreso && (
        <MovimientoModal
          tipo="egreso"
          turnoId={turno.id}
          onClose={() => setShowEgreso(false)}
          onSuccess={() => {
            setShowEgreso(false)
            qc.invalidateQueries({ queryKey: ['egresos'] })
          }}
        />
      )}
      {showIngreso && (
        <MovimientoModal
          tipo="ingreso"
          turnoId={turno.id}
          onClose={() => setShowIngreso(false)}
          onSuccess={() => {
            setShowIngreso(false)
            qc.invalidateQueries({ queryKey: ['egresos'] })
          }}
        />
      )}
    </div>
  )
}

function AbrirTurnoModal({ onClose, onSuccess }) {
  const [fondoUsd, setFondoUsd] = useState('0')
  const [fondoCop, setFondoCop] = useState('0')
  const [fondoVes, setFondoVes] = useState('0')

  const mutation = useMutation({
    mutationFn: () => cajaApi.abrirTurno({
      fondo_usd: parseFloat(fondoUsd) || 0,
      fondo_cop: parseFloat(fondoCop) || 0,
      fondo_ves: parseFloat(fondoVes) || 0,
    }),
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-6 w-96 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">Abrir turno</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Fondo inicial USD</label>
            <input type="number" value={fondoUsd} onChange={e => setFondoUsd(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white font-mono" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Fondo inicial COP</label>
            <input type="number" value={fondoCop} onChange={e => setFondoCop(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white font-mono" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Fondo inicial Bs.</label>
            <input type="number" value={fondoVes} onChange={e => setFondoVes(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white font-mono" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3">
            {mutation.isPending ? 'Abriendo...' : 'Abrir turno'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CerrarTurnoModal({ turno, onClose, onSuccess }) {
  const [efectivoUsd, setEfectivoUsd] = useState('')
  const [efectivoCop, setEfectivoCop] = useState('')
  const [notas, setNotas] = useState('')

  const mutation = useMutation({
    mutationFn: () => cajaApi.cerrarTurno(turno.id, {
      efectivo_usd: parseFloat(efectivoUsd) || 0,
      efectivo_cop: parseFloat(efectivoCop) || 0,
      notas
    }),
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-6 w-96 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">Cerrar turno</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">Cuenta el efectivo físico que tienes en caja.</p>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Efectivo real USD</label>
            <input type="number" value={efectivoUsd} onChange={e => setEfectivoUsd(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Efectivo real COP</label>
            <input type="number" value={efectivoCop} onChange={e => setEfectivoCop(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Notas de cierre</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl py-3">
            {mutation.isPending ? 'Cerrando...' : 'Cerrar turno'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MovimientoModal({ tipo, turnoId, onClose, onSuccess }) {
  const esEgreso = tipo === 'egreso'
  const categorias = esEgreso ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO
  const [categoria, setCategoria] = useState(categorias[0].value)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0].value)

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        turno_id: turnoId,
        categoria,
        concepto,
        monto_usd: parseFloat(monto) || 0,
        moneda: 'USD',
        monto_moneda: parseFloat(monto) || 0,
      }
      if (esEgreso) payload.metodo_pago = metodoPago
      return esEgreso ? cajaApi.egreso(payload) : cajaApi.ingreso(payload)
    },
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-6 w-96 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">
            {esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
              {categorias.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Compra de carne"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Monto (USD)</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
          {esEgreso && (
            <div>
              <label className="text-zinc-400 text-sm block mb-1">Método de pago</label>
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
                {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !concepto || !monto}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
