// Utilidad para imprimir tickets (comanda de cocina/barra, recibo de cobro)
// usando la impresión nativa del navegador. No necesita servidor de
// impresión aparte — funciona con cualquier impresora (térmica o normal)
// que ya esté configurada en el dispositivo donde se usa el sistema.

const DESTINO_LABEL = { COCINA: 'COCINA', BAR: 'BARRA' }

function _inyectarYimprimir(html) {
  // Limpiar cualquier intento anterior que no se haya limpiado
  document.getElementById('print-ticket-area')?.remove()
  document.getElementById('print-ticket-style')?.remove()

  const contenedor = document.createElement('div')
  contenedor.id = 'print-ticket-area'
  contenedor.innerHTML = html
  document.body.appendChild(contenedor)

  const style = document.createElement('style')
  style.id = 'print-ticket-style'
  style.innerHTML = `
    @media print {
      body * { visibility: hidden; }
      #print-ticket-area, #print-ticket-area * { visibility: visible; }
      #print-ticket-area { position: absolute; top: 0; left: 0; width: 100%; }
      .ticket-seccion { page-break-after: always; }
      .ticket-seccion:last-child { page-break-after: auto; }
    }
    @media screen {
      #print-ticket-area { display: none; }
    }
  `
  document.head.appendChild(style)

  window.print()

  setTimeout(() => {
    document.getElementById('print-ticket-area')?.remove()
    document.getElementById('print-ticket-style')?.remove()
  }, 800)
}

function _ticketHtml({ titulo, subtitulo, items, total, footer, mostrarPrecios }) {
  const fecha = new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
  const filas = items.map(i => `
    <tr>
      <td style="padding:3px 0; font-size:13px;">
        <b>${i.cantidad}×</b> ${i.nombre}${i.nombre_variante ? ' — ' + i.nombre_variante : ''}
      </td>
      ${mostrarPrecios ? `<td style="text-align:right; padding:3px 0; font-size:13px; white-space:nowrap;">$${(i.subtotal || 0).toFixed(2)}</td>` : ''}
    </tr>
  `).join('')

  return `
    <div class="ticket-seccion" style="font-family: 'Courier New', monospace; width: 300px; padding: 12px; color: #000; margin: 0 auto;">
      <div style="text-align:center; font-weight:bold; font-size:16px; letter-spacing:1px;">${titulo}</div>
      ${subtitulo ? `<div style="text-align:center; font-size:13px; margin-top:2px;">${subtitulo}</div>` : ''}
      <div style="border-top:1px dashed #000; margin:8px 0;"></div>
      <table style="width:100%; border-collapse:collapse;">${filas}</table>
      ${total != null ? `
        <div style="border-top:1px dashed #000; margin:8px 0;"></div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
          <span>TOTAL</span><span>$${total.toFixed(2)}</span>
        </div>
      ` : ''}
      ${footer ? `<div style="margin-top:8px; font-size:12px;">${footer}</div>` : ''}
      <div style="text-align:center; margin-top:10px; font-size:11px; color:#333;">${fecha}</div>
    </div>
  `
}

/**
 * Imprime la comanda para cocina/barra, agrupando los items por su
 * destino_impresion. Los items con destino "NINGUNO" no se imprimen
 * (son cosas que no requieren preparación, como bebidas embotelladas).
 */
export function imprimirComanda({ etiqueta, items }) {
  const grupos = {}
  items.forEach(i => {
    const destino = i.destino_impresion || 'NINGUNO'
    if (destino === 'NINGUNO') return
    if (!grupos[destino]) grupos[destino] = []
    grupos[destino].push(i)
  })

  const destinos = Object.keys(grupos)
  if (destinos.length === 0) return // nada que imprimir (todo era NINGUNO)

  const html = destinos.map(destino =>
    _ticketHtml({
      titulo: DESTINO_LABEL[destino] || destino,
      subtitulo: etiqueta,
      items: grupos[destino],
      total: null,
      mostrarPrecios: false,
    })
  ).join('')

  _inyectarYimprimir(html)
}

/**
 * Imprime el recibo de cobro (para el cliente), con precios y total.
 */
export function imprimirRecibo({ etiqueta, items, total, metodoPago, notas }) {
  const html = _ticketHtml({
    titulo: 'TRIBUTO',
    subtitulo: etiqueta,
    items,
    total,
    mostrarPrecios: true,
    footer: [
      metodoPago ? `Método de pago: ${metodoPago}` : null,
      notas || null,
    ].filter(Boolean).join('<br>'),
  })
  _inyectarYimprimir(html)
}
