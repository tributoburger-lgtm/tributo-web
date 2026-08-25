import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, X, Search, Receipt } from 'lucide-react'
import { clientesApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

function NuevoClienteModal({ onClose, onSuccess }) {
  const [nombre, setNombre] = useState('')
  const [rifCedula, setRifCedula] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')

  const mutation = useMutation({
    mutationFn: () => clientesApi.crear({
      nombre, rif_cedula: rifCedula || null, telefono, email, notas
    }),
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">Nuevo cliente</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Cédula / RIF (opcional)</label>
            <input value={rifCedula} onChange={e => setRifCedula(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Teléfono</label>
            <input value={telefono} onChange={e => setTelefono(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Email (opcional)</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !nombre}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FichaClienteModal({ clienteId, onClose }) {
  const { token } = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['cliente', clienteId, token],
    queryFn: () => clientesApi.obtener(clienteId).then(r => r.data),
    enabled: !!token
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg">{data?.nombre || 'Cargando...'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        {isLoading && <p className="text-zinc-500 p-5">Cargando...</p>}
        {data && (
          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">Cédula/RIF:</span> <span className="text-white">{data.rif_cedula || '—'}</span></div>
              <div><span className="text-zinc-500">Teléfono:</span> <span className="text-white">{data.telefono || '—'}</span></div>
              <div><span className="text-zinc-500">Email:</span> <span className="text-white">{data.email || '—'}</span></div>
              <div><span className="text-zinc-500">Tipo:</span> <span className="text-white">{data.tipo}</span></div>
            </div>

            {data.credito_limite_usd > 0 && (
              <div className="bg-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-xs uppercase mb-2">Crédito</p>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Usado</span>
                  <span className="text-white font-mono">$ {data.credito_usado_usd.toFixed(2)} / $ {data.credito_limite_usd.toFixed(2)}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-700 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-yellow-400" style={{
                    width: `${Math.min(100, (data.credito_usado_usd / data.credito_limite_usd) * 100)}%`
                  }} />
                </div>
              </div>
            )}

            <div>
              <p className="text-zinc-400 text-xs uppercase mb-2 flex items-center gap-1.5">
                <Receipt size={12} /> Compras recientes
                {data.total_comprado_usd > 0 && (
                  <span className="text-zinc-600 normal-case">
                    · total últimas {data.ventas_recientes.length}: $ {data.total_comprado_usd.toFixed(2)}
                  </span>
                )}
              </p>
              {data.ventas_recientes.length === 0 ? (
                <p className="text-zinc-600 text-sm">Sin compras registradas todavía.</p>
              ) : (
                <div className="space-y-1">
                  {data.ventas_recientes.map(v => (
                    <div key={v.id} className="flex justify-between text-sm py-1.5 border-b border-zinc-800/50">
                      <span className="text-zinc-400 font-mono text-xs">{v.numero_venta}</span>
                      <span className="text-zinc-500">{dayjs(v.fecha_venta).format('DD/MM/YY')}</span>
                      <span className="text-green-400 font-mono">$ {v.total_usd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.notas && (
              <div>
                <p className="text-zinc-400 text-xs uppercase mb-1">Notas</p>
                <p className="text-zinc-300 text-sm">{data.notas}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Clientes() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNuevo, setShowNuevo] = useState(false)
  const [fichaId, setFichaId] = useState(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['clientes', search, token],
    queryFn: () => clientesApi.listar({ search: search || undefined }).then(r => r.data),
    enabled: !!token
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-yellow-400">Clientes</h1>
        <button
          onClick={() => setShowNuevo(true)}
          className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm"
        />
      </div>

      {isLoading ? <p className="text-zinc-400">Cargando...</p> : data.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>{search ? 'Sin resultados.' : 'Sin clientes registrados todavía.'}</p>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Cédula/RIF</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {data.map(c => (
                <tr key={c.id} onClick={() => setFichaId(c.id)}
                  className="border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer">
                  <td className="px-4 py-3 text-white font-medium">{c.nombre}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.rif_cedula || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.telefono || '—'}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{c.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNuevo && (
        <NuevoClienteModal
          onClose={() => setShowNuevo(false)}
          onSuccess={() => {
            setShowNuevo(false)
            qc.invalidateQueries({ queryKey: ['clientes'] })
          }}
        />
      )}
      {fichaId && <FichaClienteModal clienteId={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  )
}
