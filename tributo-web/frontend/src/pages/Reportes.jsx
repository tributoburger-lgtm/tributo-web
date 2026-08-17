import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportesApi } from '../utils/api'
import dayjs from 'dayjs'

export default function Reportes() {
  const hoy = dayjs().format('YYYY-MM-DD')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [buscar, setBuscar] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['er', desde, hasta],
    queryFn: () => reportesApi.estadoResultados(desde, hasta).then(r => r.data),
    enabled: buscar
  })

  const fila = (label, valor, color = 'text-white', bold = false) => (
    <div className={`flex justify-between py-2 border-b border-zinc-800 ${bold ? 'font-bold' : ''}`}>
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono ${color}`}>$ {(valor || 0).toFixed(2)}</span>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-yellow-400 mb-6">Estado de Resultados</h1>

      <div className="flex gap-3 mb-6">
        <div>
          <label className="text-zinc-400 text-sm block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white" />
        </div>
        <div>
          <label className="text-zinc-400 text-sm block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white" />
        </div>
        <div className="flex items-end">
          <button onClick={() => setBuscar(true)}
            className="bg-yellow-400 text-zinc-900 font-bold px-6 py-2 rounded-lg hover:bg-yellow-300">
            Generar
          </button>
        </div>
      </div>

      {isLoading && <p className="text-zinc-400">Calculando...</p>}

      {data && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-1">
          {fila('(+) Ingresos por Ventas', data.ventas, 'text-green-400')}
          {fila('(-) Costo de Ventas', data.costos, 'text-red-400')}
          {fila('(=) UTILIDAD BRUTA', data.utilidad_bruta, data.utilidad_bruta >= 0 ? 'text-blue-400' : 'text-red-400', true)}
          <div className="pt-2" />
          {fila('(-) Gastos Operativos', data.gastos, 'text-red-400')}
          {fila('(-) Mermas / Pérdidas', data.mermas, 'text-red-400')}
          {fila('(=) UTILIDAD NETA', data.utilidad_neta, data.utilidad_neta >= 0 ? 'text-yellow-400' : 'text-red-400', true)}
          {data.otros_ingresos > 0 && <>
            <div className="pt-2" />
            {fila('(+) Otros Ingresos', data.otros_ingresos, 'text-green-400')}
            {fila('(=) UAI', data.uai, data.uai >= 0 ? 'text-green-400' : 'text-red-400', true)}
          </>}
          {(data.dividendos > 0 || data.adelanto_dividendos > 0) && <>
            <div className="pt-2" />
            {data.dividendos > 0 && fila('(-) Dividendos', data.dividendos, 'text-red-400')}
            {data.adelanto_dividendos > 0 && fila('(-) Adelanto Dividendos', data.adelanto_dividendos, 'text-red-400')}
            {fila('(=) UTILIDAD RETENIDA', data.utilidad_retenida, data.utilidad_retenida >= 0 ? 'text-green-400' : 'text-red-400', true)}
          </>}
          <div className="pt-4 flex gap-6 text-sm text-zinc-500">
            <span>Margen Bruto: <span className="text-white">{data.margen_bruto}%</span></span>
            <span>Margen Neto: <span className="text-white">{data.margen_neto}%</span></span>
          </div>
        </div>
      )}
    </div>
  )
}
