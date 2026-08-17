import { useQuery } from '@tanstack/react-query'
import { inventarioApi } from '../utils/api'

export default function Inventario() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['stock'],
    queryFn: () => inventarioApi.stock().then(r => r.data)
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-yellow-400 mb-6">Inventario</h1>
      {isLoading ? <p className="text-zinc-400">Cargando...</p> : (
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
                <tr key={p.producto_id} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                  <td className="px-4 py-3 text-white font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">{p.cantidad.toFixed(2)} {p.unidad}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{p.stock_minimo}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      p.estado === 'CRITICO' ? 'bg-red-900/30 text-red-400' :
                      p.estado === 'BAJO' ? 'bg-yellow-900/30 text-yellow-400' :
                      'bg-green-900/30 text-green-400'
                    }`}>{p.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
