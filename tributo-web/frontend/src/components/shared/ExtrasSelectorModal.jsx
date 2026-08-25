import { useState } from 'react'

export default function ExtrasSelectorModal({ prod, variante, onConfirm, onClose }) {
  const [seleccionados, setSeleccionados] = useState([])

  const toggle = (extra) => {
    setSeleccionados(prev =>
      prev.find(e => e.id === extra.id)
        ? prev.filter(e => e.id !== extra.id)
        : [...prev, extra]
    )
  }

  const extraTotal = seleccionados.reduce((s, e) => s + e.precio_usd, 0)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl p-6 w-80 border border-zinc-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-yellow-400 font-bold text-lg mb-1">{prod.nombre}{variante ? ` — ${variante.nombre}` : ''}</h2>
        <p className="text-zinc-500 text-xs mb-4">¿Algún extra?</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(prod.extras || []).map(ex => {
            const activo = seleccionados.some(e => e.id === ex.id)
            return (
              <label key={ex.id}
                className={`w-full flex justify-between items-center px-3 py-2.5 rounded-xl cursor-pointer border transition-colors ${
                  activo ? 'bg-yellow-400/10 border-yellow-400' : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                }`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={activo} onChange={() => toggle(ex)} className="accent-yellow-400" />
                  <span className="text-white text-sm">{ex.nombre}</span>
                </span>
                <span className="text-yellow-400 font-mono text-sm">+$ {ex.precio_usd.toFixed(2)}</span>
              </label>
            )
          })}
        </div>
        <div className="flex justify-between text-white text-sm mt-4 mb-2">
          <span>Extra</span>
          <span className="font-mono text-yellow-400">+$ {extraTotal.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-zinc-500 hover:text-zinc-300 text-sm py-2">Cancelar</button>
          <button onClick={() => onConfirm(seleccionados)}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold rounded-xl py-2.5 text-sm">
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
