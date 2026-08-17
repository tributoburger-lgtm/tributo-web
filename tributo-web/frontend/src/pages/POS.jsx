import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Trash2, ShoppingCart, CreditCard, ChevronDown } from 'lucide-react'
import { productosApi, ventasApi, configApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'

export default function POS() {
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [moneda, setMoneda] = useState('USD')
  const [showPago, setShowPago] = useState(false)
  const [varModal, setVarModal] = useState(null) // producto con variantes
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => productosApi.listar({ activo: true }).then(r => r.data)
  })

  const { data: tasas = [] } = useQuery({
    queryKey: ['tasas'],
    queryFn: () => configApi.tasas().then(r => r.data)
  })

  const tasa = (m) => {
    const t = tasas.find(t => t.moneda_destino === m && t.vigente)
    return t?.tasa || 1
  }

  const filtered = productos.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase())
  )

  const addToCart = (prod, variante = null) => {
    const key = `${prod.id}-${variante?.id || 0}`
    const precio = variante?.precio_usd || prod.precio_venta_usd
    setCart(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, {
        key, prod_id: prod.id, variante_id: variante?.id || null,
        nombre: variante ? `${prod.nombre} ${variante.nombre}` : prod.nombre,
        precio_usd: precio, qty: 1
      }]
    })
    setVarModal(null)
  }

  const handleProductClick = (prod) => {
    if (prod.tiene_variantes && prod.variantes?.length > 0) {
      setVarModal(prod)
    } else {
      addToCart(prod)
    }
  }

  const removeFromCart = (key) => setCart(prev => prev.filter(i => i.key !== key))
  const updateQty = (key, qty) => {
    if (qty <= 0) return removeFromCart(key)
    setCart(prev => prev.map(i => i.key === key ? { ...i, qty } : i))
  }

  const subtotal = cart.reduce((s, i) => s + i.precio_usd * i.qty, 0)
  const totalDisplay = moneda === 'USD' ? subtotal : subtotal * tasa(moneda)
  const simbol = { USD: '$', VES: 'Bs.', COP: 'COP$' }[moneda]

  const ventaMutation = useMutation({
    mutationFn: (data) => ventasApi.crear(data).then(r => r.data),
    onSuccess: () => {
      setCart([])
      setShowPago(false)
      qc.invalidateQueries(['ventas'])
    }
  })

  const confirmarVenta = (pagos) => {
    ventaMutation.mutate({
      tipo: 'RAPIDA',
      almacen_id: 1,
      moneda_display: moneda,
      tasa_ves: tasa('VES'),
      tasa_cop: tasa('COP'),
      items: cart.map(i => ({
        producto_id: i.prod_id,
        variante_id: i.variante_id,
        cantidad: i.qty,
        precio_unitario_usd: i.precio_usd,
        nombre: i.nombre
      })),
      pagos
    })
  }

  return (
    <div className="flex h-full">
      {/* Productos */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-yellow-400"
          />
        </div>

        {/* Grid productos */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(prod => (
              <button
                key={prod.id}
                onClick={() => handleProductClick(prod)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-yellow-400/50 hover:bg-zinc-800/50 transition-all group"
              >
                <p className="font-semibold text-white text-sm leading-tight group-hover:text-yellow-400">
                  {prod.nombre}
                </p>
                <p className="text-yellow-400 font-mono text-sm mt-2">
                  $ {prod.precio_venta_usd.toFixed(2)}
                </p>
                {prod.tiene_inventario && (
                  <p className={`text-xs mt-1 ${prod.stock <= (prod.stock_critico || 0) ? 'text-red-400' : 'text-zinc-500'}`}>
                    Stock: {prod.stock ?? '∞'}
                  </p>
                )}
                {prod.tiene_variantes && (
                  <p className="text-xs text-zinc-600 mt-1">▼ variantes</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Carrito */}
      <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ShoppingCart size={18} className="text-yellow-400" />
            Pedido
          </div>
          <select
            value={moneda}
            onChange={e => setMoneda(e.target.value)}
            className="bg-zinc-800 text-yellow-400 text-sm border border-zinc-700 rounded-lg px-2 py-1"
          >
            <option value="USD">USD $</option>
            <option value="COP">COP$</option>
            <option value="VES">Bs.</option>
          </select>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">Agrega productos al pedido</p>
          ) : cart.map(item => (
            <div key={item.key} className="bg-zinc-800 rounded-lg p-3">
              <div className="flex justify-between items-start">
                <p className="text-white text-sm font-medium leading-tight flex-1">{item.nombre}</p>
                <button onClick={() => removeFromCart(item.key)} className="text-zinc-600 hover:text-red-400 ml-2">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.key, item.qty - 1)}
                    className="w-6 h-6 bg-zinc-700 rounded text-white text-sm hover:bg-zinc-600">−</button>
                  <span className="text-white text-sm w-6 text-center">{item.qty}</span>
                  <button onClick={() => updateQty(item.key, item.qty + 1)}
                    className="w-6 h-6 bg-zinc-700 rounded text-white text-sm hover:bg-zinc-600">+</button>
                </div>
                <span className="text-yellow-400 font-mono text-sm">
                  $ {(item.precio_usd * item.qty).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          <div className="flex justify-between text-white font-semibold text-lg">
            <span>TOTAL</span>
            <span className="text-yellow-400">{simbol} {totalDisplay.toFixed(2)}</span>
          </div>
          <button
            onClick={() => cart.length > 0 && setShowPago(true)}
            disabled={cart.length === 0}
            className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-30 text-zinc-900 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard size={18} />
            COBRAR
          </button>
          {cart.length > 0 && (
            <button onClick={() => setCart([])}
              className="w-full text-zinc-500 hover:text-red-400 text-sm py-1 transition-colors">
              Vaciar carrito
            </button>
          )}
        </div>
      </div>

      {/* Modal variantes */}
      {varModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setVarModal(null)}>
          <div className="bg-zinc-900 rounded-2xl p-6 w-80 border border-zinc-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-yellow-400 font-bold text-lg mb-4">{varModal.nombre} — ¿Cómo la deseas?</h2>
            <div className="space-y-2">
              {varModal.variantes?.map(v => (
                <button
                  key={v.id}
                  onClick={() => addToCart(varModal, v)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-yellow-400 rounded-xl px-4 py-3 text-left flex justify-between items-center transition-colors"
                >
                  <span className="text-white font-medium">{v.nombre}</span>
                  <span className="text-yellow-400 font-mono text-sm">$ {v.precio_usd.toFixed(2)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVarModal(null)} className="w-full mt-4 text-zinc-500 hover:text-zinc-300 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal pago */}
      {showPago && (
        <PagoModal
          total={subtotal}
          moneda={moneda}
          tasa={tasa}
          onConfirm={confirmarVenta}
          onClose={() => setShowPago(false)}
          loading={ventaMutation.isPending}
        />
      )}
    </div>
  )
}

function PagoModal({ total, moneda, tasa, onConfirm, onClose, loading }) {
  const [metodo, setMetodo] = useState('EFECTIVO_USD')
  const [monto, setMonto] = useState(total.toFixed(2))

  const handleConfirm = () => {
    const monto_num = parseFloat(monto) || total
    const monto_usd = moneda === 'USD' ? monto_num : monto_num / tasa(moneda)
    onConfirm([{ metodo_pago: metodo, moneda, monto: monto_num, monto_usd, tasa_usada: tasa(moneda) }])
  }

  const simbol = { USD: '$', VES: 'Bs.', COP: 'COP$' }[moneda]
  const totalDisplay = moneda === 'USD' ? total : total * tasa(moneda)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-6 w-96 border border-zinc-700">
        <h2 className="text-white font-bold text-xl mb-1">Cobrar</h2>
        <p className="text-yellow-400 font-mono text-2xl font-bold mb-6">
          {simbol} {totalDisplay.toFixed(2)}
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1">Método de pago</label>
            <select
              value={metodo}
              onChange={e => setMetodo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white"
            >
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
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              className="w-full bg-zinc-800 border border-yellow-400 rounded-lg px-3 py-2.5 text-yellow-400 font-mono text-lg"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-400 rounded-xl py-3 font-medium hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-900 font-bold rounded-xl py-3"
          >
            {loading ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
