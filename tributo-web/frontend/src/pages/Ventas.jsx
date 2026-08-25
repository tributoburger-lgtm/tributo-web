import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Search, X, Ban, CreditCard } from 'lucide-react'
import { ventasApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

const ESTADO_STYLE = {
  CERRADA: 'bg-green-900/30 text-green-400',
  ABIERTA: 'bg-blue-900/30 text-blue-400',
  ANULADA: 'bg-red-900/30 text-red-400',
}

function AnularModal({ venta, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('')
  const mutation = useMutation({
    mutationFn: () => ventasApi.anular(venta.id, motivo),
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl flex items-center gap-2">
            <Ban className="text-red-400" size={20} /> Anular venta
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Se devuelve el inventario de <span className="text-white font-mono">{venta.numero_venta}</span> automáticamente.
        </p>
        <label className="text-zinc-400 text-sm block mb-1">Motivo</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
          placeholder="Ej: cliente se equivocó de producto"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !motivo.trim()}
            className="flex-1 bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Anulando...' : 'Anular venta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalleVentaModal({ ventaId, onClose, onAnular }) {
  const { token } = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['venta', ventaId, token],
    queryFn: () => ventasApi.obtener(ventaId).then(r => r.data),
    enabled: !!token
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-bold text-lg font-mono">{data?.numero_venta || 'Cargando...'}</h2>
            {data && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_STYLE[data.estado] || 'bg-zinc-700 text-zinc-400'}`}>
                {data.estado}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        {isLoading && <p className="text-zinc-500 p-5">Cargando...</p>}
        {data && (
          <>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-zinc-500">Fecha:</span> <span className="text-white">{dayjs(data.fecha_venta).format('DD/MM/YY HH:mm')}</span></div>
                <div><span className="text-zinc-500">Vendedor:</span> <span className="text-white">{data.usuario_nombre || '—'}</span></div>
                <div><span className="text-zinc-500">Cliente:</span> <span className="text-white">{data.cliente_nombre || 'Sin cliente'}</span></div>
                <div><span className="text-zinc-500">Tipo:</span> <span className="text-white">{data.tipo}</span></div>
              </div>

              {data.anulada && (
                <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-semibold">Venta anulada</p>
                  <p className="text-red-300/70 text-xs mt-0.5">{data.motivo_anulacion}</p>
                </div>
              )}

              <div>
                <p className="text-zinc-500 text-xs uppercase mb-2">Items</p>
                <table className="w-full text-sm">
                  <tbody>
                    {data.items.map(i => (
                      <tr key={i.id} className={`border-b border-zinc-800/50 ${i.devuelto ? 'opacity-40 line-through' : ''}`}>
                        <td className="py-1.5 text-white">{i.cantidad}× {i.nombre}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-400">$ {i.subtotal_usd.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-zinc-500 text-xs uppercase mb-2 flex items-center gap-1.5">
                  <CreditCard size={12} /> Pagos
                </p>
                {data.pagos.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="text-zinc-400">{p.metodo_pago}</span>
                    <span className="text-green-400 font-mono">$ {p.monto_usd.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-3 border-t border-zinc-800">
                <span className="text-white font-bold">Total</span>
                <span className="text-yellow-400 font-mono font-bold text-lg">$ {data.total_usd.toFixed(2)}</span>
              </div>
            </div>

            {!data.anulada && data.estado === 'CERRADA' && (
              <div className="p-5 border-t border-zinc-800">
                <button
                  onClick={() => onAnular(data)}
                  className="w-full bg-zinc-800 hover:bg-red-900/30 text-red-400 font-semibold rounded-xl py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Ban size={16} /> Anular esta venta
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Ventas() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const hoy = dayjs().format('YYYY-MM-DD')
  const [desde, setDesde] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [hasta, setHasta] = useState(hoy)
  const [search, setSearch] = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const [anulando, setAnulando] = useState(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['ventas', desde, hasta, search, token],
    queryFn: () => ventasApi.listar({ desde, hasta, search: search || undefined }).then(r => r.data),
    enabled: !!token
  })

  const totalPeriodo = data.filter(v => !v.anulada).reduce((s, v) => s + v.total_usd, 0)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-yellow-400 mb-1">Ventas</h1>
      <p className="text-zinc-500 text-sm mb-4">Historial de todas las ventas del período</p>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="text-zinc-400 text-xs block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="text-zinc-400 text-xs block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div className="flex gap-1">
          {[
            { label: 'Hoy', d: hoy, h: hoy },
            { label: 'Este mes', d: dayjs().startOf('month').format('YYYY-MM-DD'), h: hoy },
          ].map(p => (
            <button key={p.label} onClick={() => { setDesde(p.d); setHasta(p.h) }}
              className="text-xs px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar N° de venta..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm"
          />
        </div>
      </div>

      <div className="flex justify-between items-center mb-3">
        <p className="text-zinc-500 text-sm">{data.length} venta{data.length !== 1 ? 's' : ''}</p>
        <p className="text-zinc-400 text-sm">Total: <span className="text-yellow-400 font-mono font-bold">$ {totalPeriodo.toFixed(2)}</span></p>
      </div>

      {isLoading ? <p className="text-zinc-400">Cargando...</p> : data.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Receipt size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sin ventas en este período.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">N° Venta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map(v => (
                <tr key={v.id} onClick={() => setDetalleId(v.id)}
                  className="border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer">
                  <td className="px-4 py-3 text-white font-mono text-xs">{v.numero_venta}</td>
                  <td className="px-4 py-3 text-zinc-400">{v.cliente_nombre || '—'}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{v.tipo}</td>
                  <td className="px-4 py-3 text-zinc-500">{dayjs(v.fecha_venta).format('DD/MM/YY HH:mm')}</td>
                  <td className={`px-4 py-3 text-right font-mono ${v.anulada ? 'text-zinc-600 line-through' : 'text-yellow-400'}`}>
                    $ {v.total_usd.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_STYLE[v.estado] || 'bg-zinc-700 text-zinc-400'}`}>
                      {v.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalleId && (
        <DetalleVentaModal
          ventaId={detalleId}
          onClose={() => setDetalleId(null)}
          onAnular={(venta) => setAnulando(venta)}
        />
      )}
      {anulando && (
        <AnularModal
          venta={anulando}
          onClose={() => setAnulando(null)}
          onSuccess={() => {
            setAnulando(null)
            setDetalleId(null)
            qc.invalidateQueries({ queryKey: ['ventas'] })
            qc.invalidateQueries({ queryKey: ['stock'] })
          }}
        />
      )}
    </div>
  )
}
