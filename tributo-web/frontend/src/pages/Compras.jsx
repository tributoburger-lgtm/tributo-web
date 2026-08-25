import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, Plus, X, Trash2, PackageCheck, Truck, Ban, UserPlus, PackagePlus } from 'lucide-react'
import { comprasApi, productosApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

const ESTADO_STYLE = {
  PENDIENTE: 'bg-amber-900/30 text-amber-400',
  PARCIAL: 'bg-blue-900/30 text-blue-400',
  RECIBIDA: 'bg-green-900/30 text-green-400',
  CANCELADA: 'bg-red-900/30 text-red-400',
}

function NuevoProveedorInline({ onCreado, onCancelar }) {
  const [nombre, setNombre] = useState('')
  const mutation = useMutation({
    mutationFn: () => comprasApi.crearProveedor({ nombre }),
    onSuccess: (res) => onCreado({ id: res.data.id, nombre: res.data.nombre })
  })
  return (
    <div className="flex gap-2 mt-2">
      <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
        placeholder="Nombre del proveedor nuevo"
        className="flex-1 bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2 text-white text-sm" />
      <button onClick={() => mutation.mutate()} disabled={!nombre || mutation.isPending}
        className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold px-3 rounded-lg text-sm">
        Crear
      </button>
      <button onClick={onCancelar} className="text-zinc-500 hover:text-white px-2"><X size={16} /></button>
    </div>
  )
}

function NuevoProductoInline({ onCreado, onCancelar }) {
  const [nombre, setNombre] = useState('')
  const [costo, setCosto] = useState('')
  const [unidad, setUnidad] = useState('UND')
  const mutation = useMutation({
    mutationFn: () => productosApi.crear({
      nombre, precio_costo_usd: parseFloat(costo) || 0, unidad, tiene_inventario: true
    }),
    onSuccess: (res) => onCreado({ id: res.data.id, nombre: res.data.nombre, precio_costo_usd: parseFloat(costo) || 0, unidad })
  })
  return (
    <div className="bg-zinc-800/70 rounded-lg p-3 mt-2 space-y-2">
      <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
        placeholder="Nombre del producto nuevo"
        className="w-full bg-zinc-900 border border-yellow-400 rounded-lg px-3 py-2 text-white text-sm" />
      <div className="flex gap-2">
        <input type="number" step="0.01" value={costo} onChange={e => setCosto(e.target.value)}
          placeholder="Costo estimado"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-green-400 font-mono text-sm" />
        <input value={unidad} onChange={e => setUnidad(e.target.value)}
          placeholder="Unidad"
          className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-zinc-800 text-zinc-400 rounded-lg py-2 text-sm">Cancelar</button>
        <button onClick={() => mutation.mutate()} disabled={!nombre || mutation.isPending}
          className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-lg py-2 text-sm">
          Crear producto
        </button>
      </div>
    </div>
  )
}

function NuevaCompraModal({ proveedores, productos, onClose, onSuccess }) {
  const qc = useQueryClient()
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id || '')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState([])
  const [proveedoresLocal, setProveedoresLocal] = useState(proveedores)
  const [productosLocal, setProductosLocal] = useState(productos)
  const [showNuevoProveedor, setShowNuevoProveedor] = useState(false)
  const [showNuevoProducto, setShowNuevoProducto] = useState(false)

  const mutation = useMutation({
    mutationFn: () => comprasApi.crear({
      proveedor_id: proveedorId ? parseInt(proveedorId) : null,
      moneda: 'USD',
      notas,
      items: items.map(i => ({
        producto_id: i.producto_id,
        cantidad: parseFloat(i.cantidad) || 0,
        precio_unitario_usd: parseFloat(i.precio_unitario_usd) || 0,
      }))
    }),
    onSuccess
  })

  const idsUsados = new Set(items.map(i => i.producto_id))
  const disponibles = productosLocal.filter(p => !idsUsados.has(p.id))

  const agregar = (prod) => {
    if (!prod) return
    setItems(prev => [...prev, {
      producto_id: prod.id, nombre: prod.nombre,
      cantidad: 1, precio_unitario_usd: prod.precio_costo_usd || 0
    }])
  }
  const quitar = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))
  const actualizar = (idx, campo, valor) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))

  const total = items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0) * (parseFloat(i.precio_unitario_usd) || 0), 0)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <ShoppingBag size={18} className="text-yellow-400" /> Nueva orden de compra
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Proveedor</label>
            {!showNuevoProveedor ? (
              <div className="flex gap-2">
                <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
                  <option value="">Sin proveedor específico</option>
                  {proveedoresLocal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button onClick={() => setShowNuevoProveedor(true)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-zinc-400 hover:text-yellow-400" title="Crear proveedor nuevo">
                  <UserPlus size={16} />
                </button>
              </div>
            ) : (
              <NuevoProveedorInline
                onCreado={(nuevo) => {
                  setProveedoresLocal(prev => [...prev, nuevo])
                  setProveedorId(nuevo.id)
                  setShowNuevoProveedor(false)
                  qc.invalidateQueries({ queryKey: ['proveedores'] })
                }}
                onCancelar={() => setShowNuevoProveedor(false)}
              />
            )}
          </div>

          <div>
            <label className="text-zinc-400 text-sm block mb-2">Items</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                  <span className="flex-1 text-white text-sm truncate">{it.nombre}</span>
                  <input type="number" step="0.01" value={it.cantidad}
                    onChange={e => actualizar(idx, 'cantidad', e.target.value)}
                    placeholder="Cant."
                    className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-yellow-400 font-mono text-sm text-right" />
                  <span className="text-zinc-600 text-xs">×</span>
                  <input type="number" step="0.01" value={it.precio_unitario_usd}
                    onChange={e => actualizar(idx, 'precio_unitario_usd', e.target.value)}
                    placeholder="$"
                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-green-400 font-mono text-sm text-right" />
                  <button onClick={() => quitar(idx)} className="text-zinc-600 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {items.length === 0 && <p className="text-zinc-600 text-sm py-2">Sin items todavía.</p>}
            </div>

            {!showNuevoProducto ? (
              <div className="flex gap-2 mt-3">
                <select value="" onChange={e => agregar(productosLocal.find(p => p.id === parseInt(e.target.value)))}
                  className="flex-1 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg px-3 py-2 text-zinc-400 text-sm">
                  <option value="">+ Agregar producto...</option>
                  {disponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button onClick={() => setShowNuevoProducto(true)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-zinc-400 hover:text-yellow-400" title="Crear producto nuevo">
                  <PackagePlus size={16} />
                </button>
              </div>
            ) : (
              <NuevoProductoInline
                onCreado={(nuevo) => {
                  setProductosLocal(prev => [...prev, nuevo])
                  agregar(nuevo)
                  setShowNuevoProducto(false)
                  qc.invalidateQueries({ queryKey: ['productos-todos'] })
                }}
                onCancelar={() => setShowNuevoProducto(false)}
              />
            )}
          </div>

          <div>
            <label className="text-zinc-400 text-sm block mb-1">Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
          </div>

          <div className="bg-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Total estimado</span>
            <span className="text-yellow-400 font-mono text-xl font-bold">$ {total.toFixed(2)}</span>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-800 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || items.length === 0}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Creando...' : 'Crear orden'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AnularCompraModal({ compra, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('')
  const mutation = useMutation({
    mutationFn: () => comprasApi.anular(compra.id, motivo),
    onSuccess
  })
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl flex items-center gap-2">
            <Ban className="text-red-400" size={20} /> Anular compra
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Se revierte del inventario todo lo que ya se había recibido de <span className="text-white font-mono">{compra.numero_compra}</span>.
        </p>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
          placeholder="Motivo (opcional)"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Anulando...' : 'Anular compra'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalleCompraModal({ compraId, onClose, onCambio }) {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [anulando, setAnulando] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['compra', compraId, token],
    queryFn: () => comprasApi.obtener(compraId).then(r => r.data),
    enabled: !!token
  })

  const recibir = useMutation({
    mutationFn: () => comprasApi.recibir(compraId, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      onCambio()
    }
  })

  if (anulando && data) {
    return (
      <AnularCompraModal
        compra={data}
        onClose={() => setAnulando(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['compras'] })
          qc.invalidateQueries({ queryKey: ['stock'] })
          onCambio()
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-bold text-lg">{data?.numero_compra || 'Cargando...'}</h2>
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
            <div className="overflow-y-auto flex-1 p-5">
              <p className="text-zinc-400 text-sm mb-4">Proveedor: <span className="text-white">{data.proveedor_nombre}</span></p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-left border-b border-zinc-800">
                    <th className="pb-2">Producto</th>
                    <th className="pb-2 text-right">Pedido</th>
                    <th className="pb-2 text-right">Recibido</th>
                    <th className="pb-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(i => (
                    <tr key={i.detalle_id} className="border-b border-zinc-800/50">
                      <td className="py-2 text-white">{i.nombre}</td>
                      <td className="py-2 text-right text-zinc-400">{i.cantidad}</td>
                      <td className="py-2 text-right text-green-400">{i.cantidad_recibida}</td>
                      <td className="py-2 text-right font-mono text-zinc-400">$ {i.subtotal_usd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between mt-4 pt-4 border-t border-zinc-800">
                <span className="text-zinc-400 font-semibold">Total</span>
                <span className="text-yellow-400 font-mono font-bold">$ {data.total_usd.toFixed(2)}</span>
              </div>
            </div>
            {data.estado !== 'CANCELADA' && (
              <div className="p-5 border-t border-zinc-800 space-y-2">
                {data.estado !== 'RECIBIDA' && (
                  <button
                    onClick={() => recibir.mutate()}
                    disabled={recibir.isPending}
                    className="w-full bg-green-500/90 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl py-3 flex items-center justify-center gap-2"
                  >
                    <PackageCheck size={18} /> {recibir.isPending ? 'Recibiendo...' : 'Marcar como recibida'}
                  </button>
                )}
                <button
                  onClick={() => setAnulando(true)}
                  className="w-full bg-zinc-800 hover:bg-red-900/30 text-red-400 font-semibold rounded-xl py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Ban size={16} /> Anular compra
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Compras() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [showNueva, setShowNueva] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  const { data: compras = [], isLoading } = useQuery({
    queryKey: ['compras', token],
    queryFn: () => comprasApi.listar().then(r => r.data),
    enabled: !!token
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores', token],
    queryFn: () => comprasApi.proveedores().then(r => r.data),
    enabled: !!token && showNueva
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-todos', token],
    queryFn: () => productosApi.listar({ activo: true }).then(r => r.data),
    enabled: !!token && showNueva
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-yellow-400">Compras</h1>
        <button
          onClick={() => setShowNueva(true)}
          className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nueva orden
        </button>
      </div>
      <p className="text-zinc-500 text-sm mb-6">Órdenes de compra a proveedores</p>

      {isLoading ? <p className="text-zinc-400">Cargando...</p> : compras.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Truck size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sin órdenes de compra todavía.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">N° Orden</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id} onClick={() => setDetalleId(c.id)}
                  className={`border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer ${c.estado === 'CANCELADA' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-white font-mono text-xs">{c.numero_compra}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-zinc-500">{dayjs(c.fecha_compra).format('DD/MM/YY')}</td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">$ {c.total_usd.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_STYLE[c.estado] || 'bg-zinc-700 text-zinc-400'}`}>
                      {c.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNueva && (
        <NuevaCompraModal
          proveedores={proveedores}
          productos={productos}
          onClose={() => setShowNueva(false)}
          onSuccess={() => {
            setShowNueva(false)
            qc.invalidateQueries({ queryKey: ['compras'] })
          }}
        />
      )}
      {detalleId && (
        <DetalleCompraModal
          compraId={detalleId}
          onClose={() => setDetalleId(null)}
          onCambio={() => setDetalleId(null)}
        />
      )}
    </div>
  )
}
