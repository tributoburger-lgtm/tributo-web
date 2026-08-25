import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { reportesApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

function fila(label, valor, color = 'text-white', bold = false) {
  return (
    <div className={`flex justify-between py-2 border-b border-zinc-800 ${bold ? 'font-bold' : ''}`}>
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono ${color}`}>$ {(valor || 0).toFixed(2)}</span>
    </div>
  )
}

function BloqueDetalle({ titulo, bloque, color }) {
  if (!bloque || bloque.total === 0) {
    return fila(`(-) ${titulo}`, bloque?.total || 0, color)
  }
  return (
    <div className="py-1 border-b border-zinc-800">
      <div className={`flex justify-between font-semibold ${color}`}>
        <span>(-) {titulo}</span>
        <span className="font-mono">$ {bloque.total.toFixed(2)}</span>
      </div>
      {bloque.det && bloque.det.length > 0 && (
        <div className="pl-4 mt-1 space-y-0.5">
          {bloque.det.map((d, i) => (
            <div key={i} className="flex justify-between text-xs text-zinc-500">
              <span className="truncate max-w-[70%]">{d.concepto}</span>
              <span className="font-mono">$ {(d.monto_usd || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Reportes() {
  const hoy = dayjs().format('YYYY-MM-DD')
  const inicioMes = dayjs().startOf('month').format('YYYY-MM-DD')
  const { token } = useAuthStore()
  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [tab, setTab] = useState('er') // 'er' | 'ventas'

  const { data: er, isLoading: cargandoEr } = useQuery({
    queryKey: ['estado-resultados', desde, hasta, token],
    queryFn: () => reportesApi.estadoResultados(desde, hasta).then(r => r.data),
    enabled: !!token
  })

  const { data: ventasDia = [], isLoading: cargandoVentas } = useQuery({
    queryKey: ['ventas-por-dia', desde, hasta, token],
    queryFn: () => reportesApi.ventasPorDia(desde, hasta).then(r => r.data),
    enabled: !!token && tab === 'ventas'
  })

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-yellow-400 mb-1">Reportes</h1>
      <p className="text-zinc-500 text-sm mb-6">Estado de Resultados y ventas del período</p>

      {/* Filtros de fecha */}
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
        <div className="flex gap-1 ml-2">
          {[
            { label: 'Hoy', d: hoy, h: hoy },
            { label: 'Este mes', d: inicioMes, h: hoy },
          ].map(p => (
            <button key={p.label} onClick={() => { setDesde(p.d); setHasta(p.h) }}
              className="text-xs px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        {[{ k: 'er', l: 'Estado de Resultados' }, { k: 'ventas', l: 'Ventas por Día' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.k ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'er' && (
        <>
          {cargandoEr && <p className="text-zinc-500">Calculando...</p>}
          {er && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-1">
              {fila('(+) Ingresos por Ventas', er.ventas, 'text-green-400')}
              {fila('(-) Costo de Ventas Directo', er.costo_directo, 'text-amber-400')}
              {er.costo_blocks?.map((b, i) => (
                <BloqueDetalle key={i} titulo={b.label} bloque={b} color="text-amber-400" />
              ))}
              <div className="pt-1" />
              {fila(
                `(=) UTILIDAD BRUTA (${er.margen_bruto}%)`,
                er.utilidad_bruta,
                er.utilidad_bruta >= 0 ? 'text-blue-400' : 'text-red-400',
                true
              )}
              <div className="pt-2" />
              {er.gasto_blocks?.map((b, i) => (
                <BloqueDetalle key={i} titulo={b.label} bloque={b} color="text-red-400" />
              ))}
              <div className="pt-1" />
              {fila(
                `(=) UTILIDAD OPERATIVA (${er.margen_operativo}%)`,
                er.utilidad_operativa,
                er.utilidad_operativa >= 0 ? 'text-green-400' : 'text-red-400',
                true
              )}

              {er.otros_ingresos > 0 && <>
                <div className="pt-2" />
                {fila('(+) Otros Ingresos', er.otros_ingresos, 'text-green-400')}
                {fila('(=) Utilidad Antes de Dividendos', er.uai, er.uai >= 0 ? 'text-green-400' : 'text-red-400', true)}
              </>}

              {(er.dividendos > 0 || er.adelanto_dividendos > 0) && <>
                <div className="pt-2" />
                {er.dividendos > 0 && fila('(-) Dividendos', er.dividendos, 'text-red-400')}
                {er.adelanto_dividendos > 0 && fila('(-) Adelanto de Dividendos', er.adelanto_dividendos, 'text-red-400')}
                {fila('(=) UTILIDAD RETENIDA', er.utilidad_retenida, er.utilidad_retenida >= 0 ? 'text-yellow-400' : 'text-red-400', true)}
              </>}
            </div>
          )}
        </>
      )}

      {tab === 'ventas' && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          {cargandoVentas && <p className="text-zinc-500">Cargando...</p>}
          {!cargandoVentas && ventasDia.length === 0 && (
            <p className="text-zinc-600 text-sm">Sin ventas en este período.</p>
          )}
          {ventasDia.length > 0 && (
            <>
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="dia" tick={{ fill: '#71717a', fontSize: 11 }}
                      tickFormatter={d => dayjs(d).format('DD/MM')} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                      labelFormatter={d => dayjs(d).format('DD/MM/YYYY')}
                      formatter={(v) => [`$ ${v.toFixed(2)}`, 'Ventas']}
                    />
                    <Bar dataKey="total" fill="#F5A623" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-left border-b border-zinc-800">
                    <th className="pb-2">Día</th>
                    <th className="pb-2 text-right">Transacciones</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasDia.map(d => (
                    <tr key={d.dia} className="border-b border-zinc-800/50">
                      <td className="py-2 text-white">{dayjs(d.dia).format('DD/MM/YYYY')}</td>
                      <td className="py-2 text-right text-zinc-400">{d.transacciones}</td>
                      <td className="py-2 text-right font-mono text-green-400">$ {d.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
