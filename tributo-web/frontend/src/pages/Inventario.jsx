import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, History, TrendingDown, DollarSign, Tag, Plus, Trash2, Edit2, Split, RotateCcw } from 'lucide-react'
import { inventarioApi, mermasApi, productosApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

const MOTIVOS_MERMA = ["Vencido", "Dañado", "Preparación errónea", "Robo/Extravío", "Otro"]

const TIPO_LABELS = {
  ENTRADA: { label: 'Entrada', color: 'text-green-400' },
  SALIDA: { label: 'Salida', color: 'text-red-400' },
  AJUSTE: { label: 'Ajuste', color: 'text-blue-400' },
}

function ValorizacionView() {
  const { token } = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['valorizacion', token],
    queryFn: () => inventarioApi.valorizacion().then(r => r.data),
    enabled: !!token
  })

  if (isLoading) return <p className="text-zinc-400">Calculando...</p>
  if (!data || data.items.length === 0) {
    return <p className="text-zinc-600 text-sm py-8 text-center">Sin inventario valorizado todavía.</p>
  }

  return (
    <div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-400/10 flex items-center justify-center">
          <DollarSign className="text-yellow-400" size={20} />
        </div>
        <div>
          <p className="text-zinc-500 text-xs uppercase">Capital total atado en inventario</p>
          <p className="text-yellow-400 font-mono text-2xl font-bold">$ {data.valor_total_inventario_usd.toFixed(2)}</p>
        </div>
      </div>
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right">Costo promedio</th>
              <th className="px-4 py-3 text-right">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(i => (
              <tr key={i.producto_id} className="border-t border-zinc-800">
                <td className="px-4 py-3 text-white font-medium">{i.nombre}</td>
                <td className="px-4 py-3 text-right font-mono text-zinc-400">{i.cantidad.toFixed(2)} {i.unidad}</td>
                <td className="px-4 py-3 text-right font-mono text-zinc-500">$ {i.costo_promedio_usd.toFixed(3)}</td>
                <td className="px-4 py-3 text-right font-mono text-yellow-400">$ {i.valor_total_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-zinc-600 text-xs mt-3">
        El costo promedio es real (FIFO) — refleja lo que de verdad pagaste por cada lote que aún no se ha consumido, no un precio genérico.
      </p>
    </div>
  )
}

function CategoriaFormModal({ categoria, onClose, onSuccess }) {
  const [nombre, setNombre] = useState(categoria?.nombre || '')
  const [descripcion, setDescripcion] = useState(categoria?.descripcion || '')
  const [color, setColor] = useState(categoria?.color || '#4A9EFF')

  const mutation = useMutation({
    mutationFn: () => categoria
      ? productosApi.actualizarCategoria(categoria.id, { nombre, descripcion, color })
      : productosApi.crearCategoria({ nombre, descripcion, color }),
    onSuccess
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">{categoria ? 'Editar categoría' : 'Nueva categoría'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Descripción (opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-full h-10 bg-zinc-800 border border-zinc-700 rounded-lg" />
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

function CategoriasView() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(null)
  const [showNueva, setShowNueva] = useState(false)
  const [error, setError] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['categorias', token],
    queryFn: () => productosApi.categorias().then(r => r.data),
    enabled: !!token
  })

  const eliminar = useMutation({
    mutationFn: (id) => productosApi.eliminarCategoria(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias'] }),
    onError: (e) => setError(e.response?.data?.detail || 'No se pudo eliminar')
  })

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowNueva(true)}
          className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-xl flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nueva categoría
        </button>
      </div>
      {error && (
        <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-3 mb-3 text-red-400 text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {isLoading ? <p className="text-zinc-400">Cargando...</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {data.map(c => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-white font-medium truncate">{c.nombre}</span>
              </div>
              {c.descripcion && <p className="text-zinc-500 text-xs mb-3">{c.descripcion}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => setEditando(c)} className="text-zinc-500 hover:text-yellow-400">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => eliminar.mutate(c.id)} className="text-zinc-500 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(showNueva || editando) && (
        <CategoriaFormModal
          categoria={editando}
          onClose={() => { setShowNueva(false); setEditando(null) }}
          onSuccess={() => {
            setShowNueva(false); setEditando(null)
            qc.invalidateQueries({ queryKey: ['categorias'] })
          }}
        />
      )}
    </div>
  )
}

function AjustarModal({ productos, onClose, onSuccess }) {
  const [productoId, setProductoId] = useState(productos[0]?.producto_id || '')
  const [cantidadReal, setCantidadReal] = useState('')
  const [motivo, setMotivo] = useState('')

  const producto = productos.find(p => p.producto_id === parseInt(productoId))

  const mutation = useMutation({
    mutationFn: () => inventarioApi.ajustar({
      producto_id: parseInt(productoId),
      cantidad_real: parseFloat(cantidadReal),
      motivo,
    }),
    onSuccess
  })

  const delta = producto && cantidadReal !== '' ? parseFloat(cantidadReal) - producto.cantidad : null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">Ajustar stock</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">Corrige el stock a la cantidad que contaste físicamente.</p>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Producto</label>
            <select value={productoId} onChange={e => setProductoId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
              {productos.map(p => (
                <option key={p.producto_id} value={p.producto_id}>
                  {p.nombre} (sistema dice: {p.cantidad.toFixed(2)} {p.unidad})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Cantidad real contada</label>
            <input type="number" step="0.01" value={cantidadReal} onChange={e => setCantidadReal(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
          {delta !== null && !isNaN(delta) && delta !== 0 && (
            <p className={`text-sm ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(2)} {producto?.unidad} de diferencia
            </p>
          )}
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Motivo</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: conteo físico de fin de semana"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || cantidadReal === '' || delta === 0}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Guardando...' : 'Ajustar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FraccionarView({ productos }) {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [origenId, setOrigenId] = useState('')
  const [cantidadOrigen, setCantidadOrigen] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [cantidadDestino, setCantidadDestino] = useState('')
  const [notas, setNotas] = useState('')

  const { data: historial = [] } = useQuery({
    queryKey: ['fraccionamientos', token],
    queryFn: () => inventarioApi.fraccionamientos().then(r => r.data),
    enabled: !!token
  })

  const mutation = useMutation({
    mutationFn: () => inventarioApi.fraccionar({
      producto_origen_id: parseInt(origenId),
      cantidad_origen: parseFloat(cantidadOrigen),
      producto_destino_id: parseInt(destinoId),
      cantidad_destino: parseFloat(cantidadDestino),
      notas,
    }),
    onSuccess: () => {
      setOrigenId(''); setCantidadOrigen(''); setDestinoId(''); setCantidadDestino(''); setNotas('')
      qc.invalidateQueries({ queryKey: ['fraccionamientos'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    }
  })

  const revertir = useMutation({
    mutationFn: (id) => inventarioApi.revertirFraccionamiento(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fraccionamientos'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
    }
  })

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-zinc-400 text-xs uppercase mb-3 flex items-center gap-1.5">
          <Split size={14} /> Convertir presentación
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs">Producto que se consume</p>
            <select value={origenId} onChange={e => setOrigenId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Selecciona...</option>
              {productos.map(p => <option key={p.producto_id} value={p.producto_id}>{p.nombre}</option>)}
            </select>
            <input type="number" step="0.01" value={cantidadOrigen} onChange={e => setCantidadOrigen(e.target.value)}
              placeholder="Cantidad (ej: 1 caja)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-yellow-400 font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs">Producto que resulta</p>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Selecciona...</option>
              {productos.map(p => <option key={p.producto_id} value={p.producto_id}>{p.nombre}</option>)}
            </select>
            <input type="number" step="0.01" value={cantidadDestino} onChange={e => setCantidadDestino(e.target.value)}
              placeholder="Cantidad (ej: 24 unidades)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-green-400 font-mono text-sm" />
          </div>
        </div>
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)"
          className="w-full mt-3 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !origenId || !destinoId || !cantidadOrigen || !cantidadDestino}
          className="w-full mt-3 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-2.5"
        >
          {mutation.isPending ? 'Procesando...' : 'Fraccionar'}
        </button>
        <p className="text-zinc-600 text-xs mt-2">
          El costo real se reparte automáticamente entre las unidades resultantes — no se pierde precisión de costo.
        </p>
      </div>

      <div>
        <p className="text-zinc-500 text-xs uppercase mb-2">Historial</p>
        {historial.length === 0 ? (
          <p className="text-zinc-600 text-sm">Sin fraccionamientos todavía.</p>
        ) : (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {historial.map(f => (
                  <tr key={f.id} className={`border-b border-zinc-800/50 ${f.revertido ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2.5 text-white">
                      {f.cantidad_origen} {f.origen_nombre} → {f.cantidad_destino} {f.destino_nombre}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{dayjs(f.fecha).format('DD/MM/YY')}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-zinc-400">$ {f.costo_total_usd.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!f.revertido && (
                        <button onClick={() => revertir.mutate(f.id)} className="text-zinc-500 hover:text-red-400">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KardexModal({ producto, onClose }) {
  const { token } = useAuthStore()
  const { data = [], isLoading } = useQuery({
    queryKey: ['kardex', producto.producto_id, token],
    queryFn: () => inventarioApi.kardex(producto.producto_id, 100).then(r => r.data),
    enabled: !!token
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <History size={18} className="text-yellow-400" /> {producto.nombre}
            </h2>
            <p className="text-zinc-500 text-sm">
              Stock actual: <span className="text-yellow-400 font-mono">{producto.cantidad.toFixed(2)} {producto.unidad}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoading && <p className="text-zinc-500 p-5">Cargando historial...</p>}
          {!isLoading && data.length === 0 && (
            <p className="text-zinc-600 text-sm p-5">Sin movimientos registrados para este producto.</p>
          )}
          {data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-zinc-500 text-left border-b border-zinc-800">
                  <th className="px-5 py-2">Fecha</th>
                  <th className="px-5 py-2">Tipo</th>
                  <th className="px-5 py-2 text-right">Cantidad</th>
                  <th className="px-5 py-2 text-right">Antes → Después</th>
                  <th className="px-5 py-2">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {data.map(m => {
                  const t = TIPO_LABELS[m.tipo] || { label: m.tipo, color: 'text-zinc-400' }
                  return (
                    <tr key={m.id} className="border-b border-zinc-800/50">
                      <td className="px-5 py-2 text-zinc-400 whitespace-nowrap">
                        {dayjs(m.creado_en).format('DD/MM/YY HH:mm')}
                      </td>
                      <td className={`px-5 py-2 font-medium ${t.color}`}>{t.label}</td>
                      <td className={`px-5 py-2 text-right font-mono ${t.color}`}>
                        {m.tipo === 'SALIDA' ? '-' : '+'}{m.cantidad.toFixed(2)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-zinc-500">
                        {m.cantidad_antes.toFixed(2)} → {m.cantidad_despues.toFixed(2)}
                      </td>
                      <td className="px-5 py-2 text-zinc-500 text-xs">
                        {m.referencia_tipo || '—'} {m.notas ? `· ${m.notas}` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function RegistrarMermaModal({ productos, onClose, onSuccess }) {
  const [productoId, setProductoId] = useState(productos[0]?.producto_id || '')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState(MOTIVOS_MERMA[0])
  const [notas, setNotas] = useState('')

  const mutation = useMutation({
    mutationFn: () => mermasApi.registrar({
      producto_id: parseInt(productoId),
      cantidad: parseFloat(cantidad),
      motivo,
      notas
    }),
    onSuccess
  })

  const productoSeleccionado = productos.find(p => p.producto_id === parseInt(productoId))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl flex items-center gap-2">
            <TrendingDown className="text-red-400" size={20} /> Registrar merma
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Producto</label>
            <select value={productoId} onChange={e => setProductoId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
              {productos.map(p => (
                <option key={p.producto_id} value={p.producto_id}>
                  {p.nombre} (stock: {p.cantidad.toFixed(2)} {p.unidad})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">
              Cantidad {productoSeleccionado ? `(${productoSeleccionado.unidad})` : ''}
            </label>
            <input type="number" step="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Motivo</label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
              {MOTIVOS_MERMA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Notas (opcional)</label>
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
            disabled={mutation.isPending || !cantidad || !productoId}
            className="flex-1 bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl py-3"
          >
            {mutation.isPending ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Inventario() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [seleccionado, setSeleccionado] = useState(null)
  const [showMerma, setShowMerma] = useState(false)
  const [showAjustar, setShowAjustar] = useState(false)
  const [tab, setTab] = useState('stock') // 'stock' | 'valorizacion' | 'categorias' | 'fraccionar'

  const { data = [], isLoading } = useQuery({
    queryKey: ['stock', token],
    queryFn: () => inventarioApi.stock().then(r => r.data),
    enabled: !!token
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-yellow-400">Inventario</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAjustar(true)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
          >
            <Edit2 size={16} /> Ajustar stock
          </button>
          <button
            onClick={() => setShowMerma(true)}
            className="bg-zinc-900 border border-red-900/50 text-red-400 hover:bg-red-900/20 font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
          >
            <TrendingDown size={16} /> Registrar merma
          </button>
        </div>
      </div>
      <p className="text-zinc-500 text-sm mb-4">Haz clic en un producto para ver su historial (Kardex)</p>

      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        {[
          { k: 'stock', l: 'Stock' },
          { k: 'valorizacion', l: 'Valorización' },
          { k: 'categorias', l: 'Categorías' },
          { k: 'fraccionar', l: 'Fraccionar' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.k ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'valorizacion' && <ValorizacionView />}
      {tab === 'categorias' && <CategoriasView />}
      {tab === 'fraccionar' && <FraccionarView productos={data.filter(p => p.tiene_inventario)} />}
      {tab === 'stock' && (
        isLoading ? <p className="text-zinc-400">Cargando...</p> : (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800 text-zinc-400 text-left">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Mínimo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map(p => (
                  <tr
                    key={p.producto_id}
                    onClick={() => setSeleccionado(p)}
                    className={`border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer ${!p.tiene_inventario ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 text-white font-medium">{p.nombre}</td>
                    <td className="px-4 py-3 text-right font-mono text-yellow-400">{p.cantidad.toFixed(2)} {p.unidad}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{p.tiene_inventario ? p.stock_minimo : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        p.estado === 'CRITICO' ? 'bg-red-900/30 text-red-400' :
                        p.estado === 'BAJO' ? 'bg-yellow-900/30 text-yellow-400' :
                        p.estado === 'SIN_SEGUIMIENTO' ? 'bg-zinc-800 text-zinc-500' :
                        'bg-green-900/30 text-green-400'
                      }`}>{p.estado === 'SIN_SEGUIMIENTO' ? 'Sin seguimiento' : p.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {seleccionado && <KardexModal producto={seleccionado} onClose={() => setSeleccionado(null)} />}
      {showMerma && (
        <RegistrarMermaModal
          productos={data.filter(p => p.tiene_inventario)}
          onClose={() => setShowMerma(false)}
          onSuccess={() => {
            setShowMerma(false)
            qc.invalidateQueries({ queryKey: ['stock'] })
            qc.invalidateQueries({ queryKey: ['kardex'] })
          }}
        />
      )}
      {showAjustar && (
        <AjustarModal
          productos={data.filter(p => p.tiene_inventario)}
          onClose={() => setShowAjustar(false)}
          onSuccess={() => {
            setShowAjustar(false)
            qc.invalidateQueries({ queryKey: ['stock'] })
            qc.invalidateQueries({ queryKey: ['kardex'] })
          }}
        />
      )}
    </div>
  )
}
