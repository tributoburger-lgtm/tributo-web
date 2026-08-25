import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, ShoppingCart, CreditCard, Send, Users, Receipt, X, Plus, Ban, ChefHat, Package, ShoppingBag } from 'lucide-react'
import { restaurantApi, productosApi, configApi } from '../utils/api'
import { imprimirComanda, imprimirRecibo } from '../utils/printTicket'
import ExtrasSelectorModal from '../components/shared/ExtrasSelectorModal'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

const ESTADO_COLOR = {
  LIBRE: 'border-zinc-800 hover:border-yellow-400/50',
  OCUPADA: 'border-yellow-400 bg-yellow-400/5',
}

const PEDIDO_ESTADO_META = {
  PENDIENTE:      { label: 'Pendiente',       color: 'bg-amber-900/30 text-amber-400', icon: Package, next: 'EN_PREPARACION', nextLabel: 'Empezar a preparar' },
  EN_PREPARACION: { label: 'En preparación',  color: 'bg-blue-900/30 text-blue-400',  icon: ChefHat,  next: 'LISTO',          nextLabel: 'Marcar listo' },
  LISTO:          { label: 'Listo',           color: 'bg-green-900/30 text-green-400', icon: ShoppingBag, next: null,          nextLabel: null },
}

export default function Restaurant() {
  const [selectedMesa, setSelectedMesa] = useState(null)
  const [tab, setTab] = useState('mesas') // 'mesas' | 'llevar'
  const { token } = useAuthStore()

  const { data: mesas = [], isLoading } = useQuery({
    queryKey: ['mesas', token],
    queryFn: () => restaurantApi.mesas().then(r => r.data),
    enabled: !!token,
    refetchInterval: 5000
  })

  if (selectedMesa) {
    return <Comanda mesa={selectedMesa} onBack={() => setSelectedMesa(null)} />
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-yellow-400 mb-1">Restaurant</h1>
      <p className="text-zinc-500 text-sm mb-4">Mesas y pedidos para llevar</p>

      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {[{ k: 'mesas', l: 'Mesas' }, { k: 'llevar', l: 'Para Llevar' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.k ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'llevar' && <PedidosLlevarView />}

      {tab === 'mesas' && (
        isLoading ? (
          <p className="text-zinc-500">Cargando mesas...</p>
        ) : mesas.length === 0 ? (
          <p className="text-zinc-500">No hay mesas configuradas.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {mesas.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMesa(m)}
                className={`bg-zinc-900 border-2 rounded-2xl p-5 text-left transition-all ${ESTADO_COLOR[m.estado] || ESTADO_COLOR.LIBRE}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-bold text-lg">
                    {m.nombre || `Mesa ${m.numero}`}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    m.estado === 'OCUPADA' ? 'bg-yellow-400 text-zinc-900' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {m.estado}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-zinc-500 text-xs mb-2">
                  <Users size={12} /> {m.capacidad} personas · {m.zona}
                </div>
                {m.estado === 'OCUPADA' && (
                  <p className="text-yellow-400 font-mono text-lg font-bold">$ {m.total_usd.toFixed(2)}</p>
                )}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ==================== PEDIDOS PARA LLEVAR ====================

function NuevoPedidoModal({ onClose, onSuccess }) {
  const { token } = useAuthStore()
  const [clienteNombre, setClienteNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [extrasModal, setExtrasModal] = useState(null)

  const { data: productos = [] } = useQuery({
    queryKey: ['productos', token],
    queryFn: () => productosApi.listar({ activo: true }).then(r => r.data),
    enabled: !!token
  })

  const filtered = productos.filter(p => !search || p.nombre.toLowerCase().includes(search.toLowerCase()))

  const agregar = (prod, extrasElegidos = []) => {
    const extrasIds = extrasElegidos.map(e => e.id).sort().join(',')
    const key = `${prod.id}-${extrasIds}`
    const precioExtras = extrasElegidos.reduce((s, e) => s + e.precio_usd, 0)
    setItems(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, {
        key, producto_id: prod.id, nombre: prod.nombre,
        precio_unitario_usd: prod.precio_venta_usd + precioExtras,
        cantidad: 1, destino_impresion: prod.destino_impresion,
        extras: extrasElegidos.map(e => e.id),
        extrasNombres: extrasElegidos.map(e => e.nombre),
      }]
    })
    setExtrasModal(null)
  }

  const handleProductClick = (prod) => {
    if (prod.extras?.length > 0) setExtrasModal({ prod })
    else agregar(prod)
  }

  const quitar = (key) => setItems(prev => prev.filter(i => i.key !== key))
  const actualizarCantidad = (key, cantidad) => {
    if (cantidad <= 0) return quitar(key)
    setItems(prev => prev.map(i => i.key === key ? { ...i, cantidad } : i))
  }

  const total = items.reduce((s, i) => s + i.precio_unitario_usd * i.cantidad, 0)

  const mutation = useMutation({
    mutationFn: () => restaurantApi.crearPedido({
      cliente_nombre: clienteNombre, telefono,
      items: items.map(i => ({
        producto_id: i.producto_id, cantidad: i.cantidad,
        precio_unitario_usd: i.precio_unitario_usd, nombre: i.nombre, extras: i.extras || []
      }))
    }),
    onSuccess: (res) => {
      imprimirComanda({
        etiqueta: `PARA LLEVAR — ${clienteNombre || 'Sin nombre'}`,
        items: items.map(i => ({ cantidad: i.cantidad, nombre: i.nombre, destino_impresion: i.destino_impresion }))
      })
      onSuccess(res)
    }
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <ShoppingBag size={18} className="text-yellow-400" /> Nuevo pedido para llevar
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex gap-4 p-5 border-b border-zinc-800">
          <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
            placeholder="Nombre del cliente" autoFocus
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input value={telefono} onChange={e => setTelefono(e.target.value)}
            placeholder="Teléfono (opcional)"
            className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-3" />
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
              {filtered.map(p => (
                <button key={p.id} onClick={() => handleProductClick(p)}
                  className="bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 text-left">
                  <p className="text-white text-sm font-medium">{p.nombre}</p>
                  <p className="text-yellow-400 font-mono text-xs mt-1">$ {p.precio_venta_usd.toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="w-72 border-l border-zinc-800 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {items.length === 0 && <p className="text-zinc-600 text-sm text-center py-8">Agrega productos</p>}
              {items.map(i => (
                <div key={i.key} className="bg-zinc-800/50 rounded-lg p-2.5">
                  <p className="text-white text-xs font-medium">{i.nombre}</p>
                  {i.extrasNombres?.length > 0 && (
                    <p className="text-zinc-500 text-[11px] mt-0.5">+ {i.extrasNombres.join(', ')}</p>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => actualizarCantidad(i.key, i.cantidad - 1)}
                        className="w-5 h-5 bg-zinc-700 rounded text-white text-xs">−</button>
                      <span className="text-white text-xs w-5 text-center">{i.cantidad}</span>
                      <button onClick={() => actualizarCantidad(i.key, i.cantidad + 1)}
                        className="w-5 h-5 bg-zinc-700 rounded text-white text-xs">+</button>
                    </div>
                    <span className="text-yellow-400 font-mono text-xs">$ {(i.precio_unitario_usd * i.cantidad).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-zinc-800">
              <div className="flex justify-between text-white font-bold mb-3">
                <span>Total</span><span className="text-yellow-400">$ {total.toFixed(2)}</span>
              </div>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || items.length === 0}
                className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
              >
                {mutation.isPending ? 'Creando...' : 'Crear pedido'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {extrasModal && (
        <ExtrasSelectorModal
          prod={extrasModal.prod}
          onConfirm={(extras) => agregar(extrasModal.prod, extras)}
          onClose={() => setExtrasModal(null)}
        />
      )}
    </div>
  )
}

function PedidosLlevarView() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const [showNuevo, setShowNuevo] = useState(false)
  const [cobrando, setCobrando] = useState(null)

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-llevar', token],
    queryFn: () => restaurantApi.pedidos(false).then(r => r.data),
    enabled: !!token,
    refetchInterval: 8000
  })

  const { data: tasas = [] } = useQuery({
    queryKey: ['tasas', token],
    queryFn: () => configApi.tasas().then(r => r.data),
    enabled: !!token
  })
  const tasa = (m) => tasas.find(t => t.moneda_destino === m && t.vigente)?.tasa || 1

  const avanzar = useMutation({
    mutationFn: ({ id, estado }) => restaurantApi.cambiarEstadoPedido(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos-llevar'] })
  })

  const anular = useMutation({
    mutationFn: (id) => restaurantApi.anularPedido(id, 'Cancelado'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos-llevar'] })
  })

  const cobrarMutation = useMutation({
    mutationFn: ({ id, data }) => restaurantApi.cobrarPedido(id, data),
    onSuccess: (_res, variables) => {
      imprimirRecibo({
        etiqueta: `PARA LLEVAR — ${cobrando?.notas?.split(' · ')[0]?.replace('Cliente: ', '') || ''}`,
        items: [{ cantidad: 1, nombre: 'Pedido completo', subtotal: cobrando?.total_usd || 0 }],
        total: cobrando?.total_usd || 0,
        metodoPago: variables.data.pagos?.[0]?.metodo_pago,
      })
      qc.invalidateQueries({ queryKey: ['pedidos-llevar'] })
      setCobrando(null)
    }
  })

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNuevo(true)}
          className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm">
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      {isLoading ? <p className="text-zinc-400">Cargando...</p> : pedidos.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sin pedidos para llevar activos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pedidos.map(p => {
            const meta = PEDIDO_ESTADO_META[p.estado] || {}
            const Icon = meta.icon || Package
            return (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white font-semibold text-sm">{p.notas?.split(' · ')[0]?.replace('Cliente: ', '') || 'Sin nombre'}</p>
                    <p className="text-zinc-500 text-xs font-mono">{p.numero_venta}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${meta.color}`}>
                    <Icon size={12} /> {meta.label}
                  </span>
                </div>
                <p className="text-yellow-400 font-mono font-bold text-lg mb-3">$ {p.total_usd.toFixed(2)}</p>
                <div className="flex gap-2">
                  {meta.next && (
                    <button
                      onClick={() => avanzar.mutate({ id: p.id, estado: meta.next })}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg py-2"
                    >
                      {meta.nextLabel}
                    </button>
                  )}
                  {p.estado === 'LISTO' && (
                    <button
                      onClick={() => setCobrando(p)}
                      className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-zinc-900 text-xs font-bold rounded-lg py-2"
                    >
                      Cobrar
                    </button>
                  )}
                  <button onClick={() => anular.mutate(p.id)} className="text-zinc-600 hover:text-red-400 px-2">
                    <Ban size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNuevo && (
        <NuevoPedidoModal
          onClose={() => setShowNuevo(false)}
          onSuccess={() => { setShowNuevo(false); qc.invalidateQueries({ queryKey: ['pedidos-llevar'] }) }}
        />
      )}
      {cobrando && (
        <PagoModal
          titulo="Cobrar pedido"
          total={cobrando.total_usd}
          tasa={tasa}
          onConfirm={(pagos) => cobrarMutation.mutate({
            id: cobrando.id,
            data: { pagos, tasa_ves: tasa('VES'), tasa_cop: tasa('COP') }
          })}
          onClose={() => setCobrando(null)}
          loading={cobrarMutation.isPending}
        />
      )}
    </div>
  )
}

// ==================== PRECUENTA ====================

function PrecuentaModal({ mesa, cuenta, cartLocal, onClose }) {
  const itemsTotales = [
    ...(cuenta?.items || []).map(i => ({ nombre: i.nombre, cantidad: i.cantidad, subtotal: i.subtotal_usd, enviado: true })),
    ...cartLocal.map(i => ({ nombre: i.nombre + (i.nombre_variante ? ` ${i.nombre_variante}` : ''), cantidad: i.qty, subtotal: i.precio_unitario_usd * i.qty, enviado: false })),
  ]
  const total = itemsTotales.reduce((s, i) => s + i.subtotal, 0)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-bold text-xl flex items-center gap-2">
            <Receipt size={18} className="text-yellow-400" /> Precuenta
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-zinc-500 text-sm mb-4">{mesa.nombre || `Mesa ${mesa.numero}`} — vista previa, no cierra la cuenta</p>

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {itemsTotales.map((i, idx) => (
            <div key={idx} className="flex justify-between text-sm py-1 border-b border-zinc-800/50">
              <span className={i.enviado ? 'text-white' : 'text-zinc-500 italic'}>{i.cantidad}× {i.nombre}</span>
              <span className="font-mono text-zinc-400">$ {i.subtotal.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-4 mt-3 border-t border-zinc-800">
          <span className="text-white font-bold">Total</span>
          <span className="text-yellow-400 font-mono font-bold text-xl">$ {total.toFixed(2)}</span>
        </div>
        {cartLocal.length > 0 && (
          <p className="text-zinc-600 text-xs mt-2 italic">Los items en cursiva aún no se enviaron a cocina.</p>
        )}
        <button onClick={onClose} className="w-full mt-4 bg-zinc-800 text-zinc-300 rounded-xl py-2.5 text-sm hover:bg-zinc-700">
          Cerrar
        </button>
      </div>
    </div>
  )
}

// ==================== COMANDA DE MESA ====================

function Comanda({ mesa, onBack }) {
  const [search, setSearch] = useState('')
  const [cartLocal, setCartLocal] = useState([]) // items agregados aun no enviados a cocina
  const [varModal, setVarModal] = useState(null)
  const [extrasModal, setExtrasModal] = useState(null) // { prod, variante }
  const [showPago, setShowPago] = useState(false)
  const [showPrecuenta, setShowPrecuenta] = useState(false)
  const { token } = useAuthStore()
  const qc = useQueryClient()

  const { data: productos = [] } = useQuery({
    queryKey: ['productos', token],
    queryFn: () => productosApi.listar({ activo: true }).then(r => r.data),
    enabled: !!token
  })

  const { data: tasas = [] } = useQuery({
    queryKey: ['tasas', token],
    queryFn: () => configApi.tasas().then(r => r.data),
    enabled: !!token
  })

  const tasa = (m) => {
    const t = tasas.find(t => t.moneda_destino === m && t.vigente)
    return t?.tasa || 1
  }

  const abrirMutation = useMutation({
    mutationFn: () => restaurantApi.abrir(mesa.id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuenta', mesa.id] })
  })

  const { data: cuenta, isLoading: loadingCuenta } = useQuery({
    queryKey: ['cuenta', mesa.id, token],
    queryFn: () => restaurantApi.cuenta(mesa.id).then(r => r.data),
    enabled: !!token
  })

  useEffect(() => {
    if (!token) return
    if (mesa.estado === 'LIBRE' || (cuenta && !cuenta.venta_id)) {
      abrirMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesa.id, cuenta?.venta_id, token])

  const filtered = productos.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase())
  )

  const addLocal = (prod, variante = null, extrasElegidos = []) => {
    const extrasIds = extrasElegidos.map(e => e.id).sort().join(',')
    const key = `${prod.id}-${variante?.id || 0}-${extrasIds}`
    const precioBase = variante?.precio_usd || prod.precio_venta_usd
    const precioExtras = extrasElegidos.reduce((s, e) => s + e.precio_usd, 0)
    setCartLocal(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        key, producto_id: prod.id, variante_id: variante?.id || null,
        nombre: prod.nombre, nombre_variante: variante?.nombre || null,
        precio_unitario_usd: precioBase + precioExtras, qty: 1,
        destino_impresion: prod.destino_impresion,
        extras: extrasElegidos.map(e => e.id),
        extrasNombres: extrasElegidos.map(e => e.nombre),
      }]
    })
    setVarModal(null)
    setExtrasModal(null)
  }

  const siguientePaso = (prod, variante = null) => {
    if (prod.extras?.length > 0) setExtrasModal({ prod, variante })
    else addLocal(prod, variante)
  }

  const handleProductClick = (prod) => {
    if (prod.tiene_variantes && prod.variantes?.length > 0) setVarModal(prod)
    else siguientePaso(prod)
  }

  const updateLocalQty = (key, qty) => {
    if (qty <= 0) return setCartLocal(prev => prev.filter(i => i.key !== key))
    setCartLocal(prev => prev.map(i => i.key === key ? { ...i, qty } : i))
  }

  const enviarMutation = useMutation({
    mutationFn: (itemsAEnviar) => restaurantApi.agregarItems(mesa.id, itemsAEnviar.map(i => ({
      producto_id: i.producto_id, variante_id: i.variante_id, cantidad: i.qty,
      precio_unitario_usd: i.precio_unitario_usd, nombre: i.nombre, nombre_variante: i.nombre_variante,
      extras: i.extras || []
    }))),
    onSuccess: (_data, itemsAEnviar) => {
      imprimirComanda({
        etiqueta: mesa.nombre || `Mesa ${mesa.numero}`,
        items: itemsAEnviar.map(i => ({
          cantidad: i.qty, nombre: i.nombre, nombre_variante: i.nombre_variante,
          destino_impresion: i.destino_impresion
        }))
      })
      setCartLocal([])
      qc.invalidateQueries({ queryKey: ['cuenta', mesa.id] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
    }
  })

  const quitarMutation = useMutation({
    mutationFn: (detalleId) => restaurantApi.quitarItem(mesa.id, detalleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta', mesa.id] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
    }
  })

  const cobrarMutation = useMutation({
    mutationFn: (data) => restaurantApi.cobrar(mesa.id, data),
    onSuccess: (_res, variables) => {
      imprimirRecibo({
        etiqueta: mesa.nombre || `Mesa ${mesa.numero}`,
        items: (cuenta?.items || []).map(i => ({ cantidad: i.cantidad, nombre: i.nombre, subtotal: i.subtotal_usd })),
        total: totalEnviado,
        metodoPago: variables.pagos?.[0]?.metodo_pago,
      })
      qc.invalidateQueries({ queryKey: ['mesas'] })
      setShowPago(false)
      onBack()
    }
  })

  const totalEnviado = cuenta?.total_usd || 0
  const totalLocal = cartLocal.reduce((s, i) => s + i.precio_unitario_usd * i.qty, 0)
  const totalGeneral = totalEnviado + totalLocal

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="text-zinc-400 hover:text-yellow-400">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg leading-none">
              {mesa.nombre || `Mesa ${mesa.numero}`}
            </h2>
            <p className="text-zinc-500 text-xs mt-1">Comanda abierta</p>
          </div>
          <button
            onClick={() => setShowPrecuenta(true)}
            className="text-zinc-400 hover:text-yellow-400 flex items-center gap-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
          >
            <Receipt size={14} /> Precuenta
          </button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white mb-4 focus:outline-none focus:border-yellow-400"
        />

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(prod => (
              <button
                key={prod.id}
                onClick={() => handleProductClick(prod)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-yellow-400/50 hover:bg-zinc-800/50 transition-all group"
              >
                <p className="font-semibold text-white text-sm leading-tight group-hover:text-yellow-400">{prod.nombre}</p>
                <p className="text-yellow-400 font-mono text-sm mt-2">$ {prod.precio_venta_usd.toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 text-white font-semibold">
          <ShoppingCart size={18} className="text-yellow-400" /> Comanda
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingCuenta ? (
            <p className="text-zinc-600 text-sm text-center py-4">Cargando cuenta...</p>
          ) : cuenta?.items?.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase mb-2">Enviado a cocina</p>
              <div className="space-y-2">
                {cuenta.items.map(item => (
                  <div key={item.id} className="bg-zinc-800 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <p className="text-white text-sm font-medium flex-1">{item.cantidad}x {item.nombre}</p>
                      <button onClick={() => quitarMutation.mutate(item.id)} className="text-zinc-600 hover:text-red-400 ml-2">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-yellow-400 font-mono text-sm mt-1">$ {item.subtotal_usd.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cartLocal.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase mb-2">Por enviar</p>
              <div className="space-y-2">
                {cartLocal.map(item => (
                  <div key={item.key} className="bg-zinc-800/50 border border-dashed border-zinc-700 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <p className="text-white text-sm font-medium flex-1">
                        {item.nombre}{item.nombre_variante ? ` ${item.nombre_variante}` : ''}
                      </p>
                    </div>
                    {item.extrasNombres?.length > 0 && (
                      <p className="text-zinc-500 text-xs mt-0.5">+ {item.extrasNombres.join(', ')}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateLocalQty(item.key, item.qty - 1)}
                          className="w-6 h-6 bg-zinc-700 rounded text-white text-sm hover:bg-zinc-600">−</button>
                        <span className="text-white text-sm w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateLocalQty(item.key, item.qty + 1)}
                          className="w-6 h-6 bg-zinc-700 rounded text-white text-sm hover:bg-zinc-600">+</button>
                      </div>
                      <span className="text-yellow-400 font-mono text-sm">
                        $ {(item.precio_unitario_usd * item.qty).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!cuenta?.items || cuenta.items.length === 0) && cartLocal.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-8">Agrega productos a la comanda</p>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 space-y-3">
          <div className="flex justify-between text-white font-semibold text-lg">
            <span>TOTAL</span>
            <span className="text-yellow-400">$ {totalGeneral.toFixed(2)}</span>
          </div>

          {cartLocal.length > 0 && (
            <button
              onClick={() => enviarMutation.mutate(cartLocal)}
              disabled={enviarMutation.isPending}
              className="w-full bg-zinc-800 hover:bg-zinc-700 border border-yellow-400/50 disabled:opacity-50 text-yellow-400 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Send size={18} />
              {enviarMutation.isPending ? 'Enviando...' : 'Enviar a cocina'}
            </button>
          )}

          <button
            onClick={() => cuenta?.items?.length > 0 && setShowPago(true)}
            disabled={!cuenta?.items || cuenta.items.length === 0}
            className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-30 text-zinc-900 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard size={18} /> COBRAR
          </button>
        </div>
      </div>

      {varModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setVarModal(null)}>
          <div className="bg-zinc-900 rounded-2xl p-6 w-80 border border-zinc-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-yellow-400 font-bold text-lg mb-4">{varModal.nombre} — ¿Cómo la deseas?</h2>
            <div className="space-y-2">
              {varModal.variantes?.map(v => (
                <button key={v.id} onClick={() => siguientePaso(varModal, v)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-yellow-400 rounded-xl px-4 py-3 text-left flex justify-between items-center transition-colors">
                  <span className="text-white font-medium">{v.nombre}</span>
                  <span className="text-yellow-400 font-mono text-sm">$ {v.precio_usd.toFixed(2)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVarModal(null)} className="w-full mt-4 text-zinc-500 hover:text-zinc-300 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {extrasModal && (
        <ExtrasSelectorModal
          prod={extrasModal.prod}
          variante={extrasModal.variante}
          onConfirm={(extras) => addLocal(extrasModal.prod, extrasModal.variante, extras)}
          onClose={() => setExtrasModal(null)}
        />
      )}

      {showPago && (
        <PagoModal
          titulo="Cobrar mesa"
          total={totalEnviado}
          tasa={tasa}
          onConfirm={(pagos) => cobrarMutation.mutate({
            pagos, tasa_ves: tasa('VES'), tasa_cop: tasa('COP')
          })}
          onClose={() => setShowPago(false)}
          loading={cobrarMutation.isPending}
        />
      )}

      {showPrecuenta && (
        <PrecuentaModal mesa={mesa} cuenta={cuenta} cartLocal={cartLocal} onClose={() => setShowPrecuenta(false)} />
      )}
    </div>
  )
}

function PagoModal({ titulo = 'Cobrar', total, tasa, onConfirm, onClose, loading }) {
  const [metodo, setMetodo] = useState('EFECTIVO_USD')
  const [monto, setMonto] = useState(total.toFixed(2))

  const handleConfirm = () => {
    const monto_num = parseFloat(monto) || total
    onConfirm([{ metodo_pago: metodo, moneda: 'USD', monto: monto_num, monto_usd: monto_num, tasa_usada: 1 }])
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-6 w-96 border border-zinc-700">
        <h2 className="text-white font-bold text-xl mb-1">{titulo}</h2>
        <p className="text-yellow-400 font-mono text-2xl font-bold mb-6">$ {total.toFixed(2)}</p>

        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Método de pago</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white">
              <option value="EFECTIVO_USD">Efectivo USD</option>
              <option value="EFECTIVO_COP">Efectivo COP</option>
              <option value="BANCOLOMBIA_COP">Bancolombia</option>
              <option value="BINANCE">Binance</option>
              <option value="PAGO_MOVIL">Pago Móvil</option>
              <option value="ZELLE">Zelle</option>
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Monto recibido</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">Cancelar</button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3">
            {loading ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
