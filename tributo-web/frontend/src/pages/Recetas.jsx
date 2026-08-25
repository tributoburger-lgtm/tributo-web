import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Trash2, ChefHat, RefreshCw, AlertTriangle } from 'lucide-react'
import { recetasApi, productosApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'

function RecetaEditorModal({ productoId, productoNombre, onClose, onSaved }) {
  const { token } = useAuthStore()
  const qc = useQueryClient()

  const { data: receta, isLoading } = useQuery({
    queryKey: ['receta', productoId, token],
    queryFn: () => recetasApi.obtener(productoId).then(r => r.data),
    enabled: !!token
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-todos', token],
    queryFn: () => productosApi.listar({ activo: true }).then(r => r.data),
    enabled: !!token
  })

  const [rendimiento, setRendimiento] = useState(1)
  const [unidadRendimiento, setUnidadRendimiento] = useState('UND')
  const [notas, setNotas] = useState('')
  const [ingredientes, setIngredientes] = useState(null) // null = aun no cargado desde receta

  // Hidratar el formulario una sola vez cuando llega la receta
  if (receta && ingredientes === null) {
    setRendimiento(receta.rendimiento || 1)
    setUnidadRendimiento(receta.unidad_rendimiento || 'UND')
    setNotas(receta.notas || '')
    setIngredientes(receta.ingredientes.map(i => ({
      ingrediente_id: i.ingrediente_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      unidad: i.unidad,
      opcional: i.opcional,
      costo_unitario_usd: i.costo_unitario_usd,
    })))
  }

  const costoCalculado = useMemo(() => {
    if (!ingredientes || !ingredientes.length) return 0
    const total = ingredientes.reduce((s, i) => s + (i.costo_unitario_usd || 0) * (parseFloat(i.cantidad) || 0), 0)
    return total / (parseFloat(rendimiento) || 1)
  }, [ingredientes, rendimiento])

  const guardar = useMutation({
    mutationFn: () => recetasApi.guardar(productoId, {
      rendimiento: parseFloat(rendimiento) || 1,
      unidad_rendimiento: unidadRendimiento,
      notas,
      ingredientes: (ingredientes || []).map(i => ({
        ingrediente_id: i.ingrediente_id,
        cantidad: parseFloat(i.cantidad) || 0,
        unidad: i.unidad,
        opcional: i.opcional,
      }))
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recetas'] })
      onSaved()
    }
  })

  const sincronizar = useMutation({
    mutationFn: () => recetasApi.sincronizarCosto(productoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recetas'] })
  })

  const agregarIngrediente = (prod) => {
    if (!prod) return
    setIngredientes(prev => [...(prev || []), {
      ingrediente_id: prod.id, nombre: prod.nombre, cantidad: 1,
      unidad: prod.unidad || 'UND', opcional: false, costo_unitario_usd: prod.precio_costo_usd || 0
    }])
  }

  const quitarIngrediente = (idx) => {
    setIngredientes(prev => prev.filter((_, i) => i !== idx))
  }

  const actualizarIngrediente = (idx, campo, valor) => {
    setIngredientes(prev => prev.map((ing, i) => i === idx ? { ...ing, [campo]: valor } : ing))
  }

  const idsUsados = new Set((ingredientes || []).map(i => i.ingrediente_id))
  const opcionesDisponibles = productos.filter(p => p.id !== productoId && !idsUsados.has(p.id))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <ChefHat size={18} className="text-yellow-400" /> Receta — {productoNombre}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        {isLoading || ingredientes === null ? (
          <p className="text-zinc-500 p-5">Cargando...</p>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-sm block mb-1">Rendimiento</label>
                <input type="number" step="0.01" value={rendimiento} onChange={e => setRendimiento(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono" />
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1">Unidad de rendimiento</label>
                <input value={unidadRendimiento} onChange={e => setUnidadRendimiento(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white" />
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-2">Ingredientes</label>
              <div className="space-y-2">
                {ingredientes.map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-white text-sm truncate">{ing.nombre}</span>
                    <input
                      type="number" step="0.01" value={ing.cantidad}
                      onChange={e => actualizarIngrediente(idx, 'cantidad', e.target.value)}
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-yellow-400 font-mono text-sm text-right"
                    />
                    <span className="text-zinc-500 text-xs w-10">{ing.unidad}</span>
                    <span className="text-zinc-600 text-xs w-16 text-right">
                      $ {((ing.costo_unitario_usd || 0) * (parseFloat(ing.cantidad) || 0)).toFixed(3)}
                    </span>
                    <button onClick={() => quitarIngrediente(idx)} className="text-zinc-600 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {ingredientes.length === 0 && (
                  <p className="text-zinc-600 text-sm py-2">Sin ingredientes todavía — agrega abajo.</p>
                )}
              </div>

              <select
                value=""
                onChange={e => {
                  const prod = productos.find(p => p.id === parseInt(e.target.value))
                  agregarIngrediente(prod)
                }}
                className="w-full mt-3 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg px-3 py-2 text-zinc-400 text-sm"
              >
                <option value="">+ Agregar ingrediente...</option>
                {opcionesDisponibles.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} (costo: $ {(p.precio_costo_usd || 0).toFixed(3)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1">Notas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div className="bg-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Costo calculado por {unidadRendimiento}</span>
              <span className="text-yellow-400 font-mono text-xl font-bold">$ {costoCalculado.toFixed(3)}</span>
            </div>

            <button
              onClick={() => sincronizar.mutate()}
              disabled={sincronizar.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300 py-1"
            >
              <RefreshCw size={14} className={sincronizar.isPending ? 'animate-spin' : ''} />
              Usar este costo como precio de costo del producto
            </button>
          </div>
        )}

        <div className="p-5 border-t border-zinc-800 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || ingredientes === null}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {guardar.isPending ? 'Guardando...' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Recetas() {
  const { token } = useAuthStore()
  const [seleccionado, setSeleccionado] = useState(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['recetas', token],
    queryFn: () => recetasApi.listar().then(r => r.data),
    enabled: !!token
  })

  const sinReceta = data.filter(p => !p.tiene_receta).length

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-yellow-400 mb-1">Recetas</h1>
      <p className="text-zinc-500 text-sm mb-1">
        Ficha técnica de cada producto — de aquí sale el costo real y el descuento de inventario al vender.
      </p>
      {sinReceta > 0 && (
        <p className="text-amber-400 text-sm mb-4 flex items-center gap-1.5">
          <AlertTriangle size={14} /> {sinReceta} producto{sinReceta !== 1 ? 's' : ''} sin receta configurada
        </p>
      )}
      {sinReceta === 0 && <div className="mb-6" />}

      {isLoading ? <p className="text-zinc-400">Cargando...</p> : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Precio venta</th>
                <th className="px-4 py-3 text-right">Costo actual</th>
                <th className="px-4 py-3 text-right">Costo receta</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map(p => {
                const diff = p.tiene_receta && Math.abs(p.costo_calculado_usd - p.precio_costo_usd) > 0.01
                return (
                  <tr
                    key={p.producto_id}
                    onClick={() => setSeleccionado(p)}
                    className="border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-white font-medium">{p.nombre}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-400">$ {p.precio_venta_usd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-400">$ {p.precio_costo_usd.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono text-yellow-400">
                      {p.tiene_receta ? `$ ${p.costo_calculado_usd.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!p.tiene_receta ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-400">Sin receta</span>
                      ) : diff ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-900/30 text-amber-400">Costo desactualizado</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-900/30 text-green-400">
                          {p.num_ingredientes} ingrediente{p.num_ingredientes !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {seleccionado && (
        <RecetaEditorModal
          productoId={seleccionado.producto_id}
          productoNombre={seleccionado.nombre}
          onClose={() => setSeleccionado(null)}
          onSaved={() => setSeleccionado(null)}
        />
      )}
    </div>
  )
}
