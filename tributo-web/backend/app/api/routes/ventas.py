from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from datetime import datetime
from typing import Optional, List
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import (
    Venta, DetalleVenta, PagoVenta, Producto, ProductoVariante,
    Inventario, MovimientoInventario, Receta, DetalleReceta,
    VarianteIngredientes, TurnoCaja, LoteInventario
)

router = APIRouter()


def _generar_numero_venta(db: Session, empresa_id: int) -> str:
    from sqlalchemy import func
    count = db.query(func.count(Venta.id)).filter(Venta.empresa_id == empresa_id).scalar() or 0
    ahora = datetime.now()
    return f"SAPOS-{ahora.strftime('%Y%m%d')}-{str(count+1).zfill(6)}"


def _procesar_extras(db, extra_ids, cantidad_item, usuario_id, almacen_id, venta_id):
    """
    Calcula el precio de los extras elegidos y descuenta inventario del
    ingrediente ligado a cada uno (si tiene). Retorna (precio_total, ids_procesados).
    """
    if not extra_ids:
        return 0.0, []
    from app.models.models import Extra
    precio_total = 0.0
    nombres = []
    for extra_id in extra_ids:
        extra = db.query(Extra).filter(Extra.id == extra_id, Extra.activo == True).first()
        if not extra:
            continue
        precio_total += (extra.precio_usd or 0) * cantidad_item
        nombres.append(extra.nombre)
        if extra.ingrediente_id:
            _ajustar_stock(db, extra.ingrediente_id, -cantidad_item, "SALIDA",
                            usuario_id, almacen_id, "EXTRA", venta_id)
    return precio_total, nombres


def _descontar_inventario(db, producto_id, variante_id, cantidad, usuario_id, almacen_id, venta_id):
    """Descuenta inventario usando receta si aplica."""
    prod = db.query(Producto).filter(Producto.id == producto_id).first()
    if not prod or not prod.tiene_inventario:
        return 0.0

    costo_total = 0.0

    if variante_id:
        # Buscar ingredientes de la variante
        ings = db.query(VarianteIngredientes).filter(
            VarianteIngredientes.variante_id == variante_id
        ).all()

        if not ings:
            # Fallback a receta_id de la variante
            var = db.query(ProductoVariante).filter(ProductoVariante.id == variante_id).first()
            receta_id = var.receta_id if var else None
            if not receta_id:
                # Fallback a receta del producto padre
                receta = db.query(Receta).filter(
                    Receta.producto_id == producto_id, Receta.activa == True
                ).first()
                receta_id = receta.id if receta else None

            if receta_id:
                receta = db.query(Receta).filter(Receta.id == receta_id).first()
                ings_receta = db.query(DetalleReceta).filter(
                    DetalleReceta.receta_id == receta_id
                ).all()
                rend = receta.rendimiento or 1
                for ing in ings_receta:
                    cant_real = (ing.cantidad / rend) * cantidad
                    costo_total += _ajustar_stock(db, ing.ingrediente_id, -cant_real,
                                                   "SALIDA", usuario_id, almacen_id,
                                                   "VENTA_VARIANTE", venta_id)
        else:
            for ing in ings:
                cant_real = ing.cantidad * cantidad
                costo_total += _ajustar_stock(db, ing.ingrediente_id, -cant_real,
                                               "SALIDA", usuario_id, almacen_id,
                                               "VENTA_VARIANTE", venta_id)
    else:
        # Buscar receta del producto
        receta = db.query(Receta).filter(
            Receta.producto_id == producto_id, Receta.activa == True
        ).first()
        if receta:
            ings = db.query(DetalleReceta).filter(
                DetalleReceta.receta_id == receta.id
            ).all()
            rend = receta.rendimiento or 1
            for ing in ings:
                cant_real = (ing.cantidad / rend) * cantidad
                costo_total += _ajustar_stock(db, ing.ingrediente_id, -cant_real,
                                               "SALIDA", usuario_id, almacen_id,
                                               "VENTA", venta_id)
        else:
            costo_total += _ajustar_stock(db, producto_id, -cantidad,
                                           "SALIDA", usuario_id, almacen_id,
                                           "VENTA", venta_id)
    return costo_total


def _ajustar_stock(db, producto_id, delta, tipo, usuario_id, almacen_id, ref_tipo, ref_id,
                    costo_unitario_usd=None) -> float:
    """
    Ajusta stock con FIFO real (por lotes) y registra el movimiento.
    Retorna el costo TOTAL del movimiento (costo unitario real x cantidad).

    - Si delta > 0 (entrada): crea un lote nuevo con costo_unitario_usd
      (el costo real de esa compra/entrada). Si no se pasa, usa el
      precio_costo_usd del producto como respaldo.
    - Si delta < 0 (salida): consume los lotes mas viejos primero
      (FIFO). El costo de la salida es el costo real de esos lotes,
      no un precio generico. Si los lotes no alcanzan a cubrir toda
      la cantidad (stock que ya venia negativo), la parte restante se
      valora al precio_costo_usd del producto como respaldo.
    """
    inv = db.query(Inventario).filter(
        Inventario.producto_id == producto_id,
        Inventario.almacen_id == almacen_id,
        Inventario.variante_id == None
    ).first()

    antes = inv.cantidad if inv else 0.0
    despues = antes + delta

    if inv:
        inv.cantidad = despues
        if delta > 0:
            inv.ultima_entrada = datetime.now()
        else:
            inv.ultima_salida = datetime.now()
    else:
        inv = Inventario(producto_id=producto_id, almacen_id=almacen_id, cantidad=despues)
        db.add(inv)

    prod = db.query(Producto).filter(Producto.id == producto_id).first()
    empresa_id = prod.empresa_id if prod else None
    precio_respaldo = prod.precio_costo_usd if prod else 0

    if delta > 0:
        # ENTRADA: nace un lote nuevo con su costo real
        costo_unit = costo_unitario_usd if costo_unitario_usd is not None else precio_respaldo
        db.add(LoteInventario(
            empresa_id=empresa_id, producto_id=producto_id, almacen_id=almacen_id,
            cantidad_inicial=delta, cantidad_disponible=delta,
            costo_unitario_usd=costo_unit,
            referencia_tipo=ref_tipo, referencia_id=ref_id
        ))
        costo_total = costo_unit * delta
        costo_unitario_mov = costo_unit
    else:
        # SALIDA: consumir de los lotes mas viejos primero (FIFO)
        cantidad_necesaria = abs(delta)
        costo_total = 0.0
        lotes = db.query(LoteInventario).filter(
            LoteInventario.producto_id == producto_id,
            LoteInventario.almacen_id == almacen_id,
            LoteInventario.cantidad_disponible > 0
        ).order_by(LoteInventario.fecha_entrada.asc()).all()

        for lote in lotes:
            if cantidad_necesaria <= 0:
                break
            tomar = min(lote.cantidad_disponible, cantidad_necesaria)
            lote.cantidad_disponible -= tomar
            costo_total += tomar * lote.costo_unitario_usd
            cantidad_necesaria -= tomar

        if cantidad_necesaria > 0:
            # Los lotes no alcanzaron (stock ya venia en negativo) —
            # el resto se valora al precio de respaldo del producto
            costo_total += cantidad_necesaria * precio_respaldo

        costo_unitario_mov = (costo_total / abs(delta)) if delta != 0 else 0

    mov = MovimientoInventario(
        producto_id=producto_id,
        almacen_id=almacen_id,
        tipo=tipo,
        cantidad=abs(delta),
        cantidad_antes=antes,
        cantidad_despues=despues,
        referencia_tipo=ref_tipo,
        referencia_id=ref_id,
        costo_usd=costo_unitario_mov,
        usuario_id=usuario_id
    )
    db.add(mov)
    return costo_total


@router.get("/")
def listar_ventas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    from app.models.models import Cliente
    q = db.query(Venta, Cliente.nombre).outerjoin(
        Cliente, Venta.cliente_id == Cliente.id
    ).filter(Venta.empresa_id == empresa_id).order_by(desc(Venta.fecha_venta))
    if desde:
        q = q.filter(Venta.fecha_venta >= desde)
    if hasta:
        q = q.filter(Venta.fecha_venta <= hasta + " 23:59:59")
    if estado:
        q = q.filter(Venta.estado == estado)
    if search:
        q = q.filter(Venta.numero_venta.ilike(f"%{search}%"))
    rows = q.limit(limit).all()
    return [
        {
            "id": v.id, "numero_venta": v.numero_venta, "tipo": v.tipo,
            "total_usd": v.total_usd, "estado": v.estado,
            "fecha_venta": v.fecha_venta, "anulada": v.anulada,
            "cliente_nombre": cliente_nombre,
        }
        for v, cliente_nombre in rows
    ]


@router.get("/{venta_id}")
def obtener_venta(
    venta_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    v = db.query(Venta).options(
        joinedload(Venta.detalles),
        joinedload(Venta.pagos)
    ).filter(Venta.id == venta_id, Venta.empresa_id == empresa_id).first()
    if not v:
        raise HTTPException(404, "Venta no encontrada")

    from app.models.models import Cliente, Usuario
    cliente = db.query(Cliente).filter(Cliente.id == v.cliente_id).first() if v.cliente_id else None
    usuario = db.query(Usuario).filter(Usuario.id == v.usuario_id).first()

    return {
        "id": v.id, "numero_venta": v.numero_venta, "tipo": v.tipo, "estado": v.estado,
        "anulada": v.anulada, "motivo_anulacion": v.motivo_anulacion,
        "fecha_venta": v.fecha_venta, "anulada_en": v.anulada_en,
        "subtotal_usd": v.subtotal_usd, "total_usd": v.total_usd,
        "total_pagado_usd": v.total_pagado_usd,
        "moneda_display": v.moneda_display,
        "cliente_nombre": cliente.nombre if cliente else None,
        "usuario_nombre": usuario.nombre_completo if usuario else None,
        "items": [
            {
                "id": d.id, "nombre": d.nombre_producto + (f" {d.nombre_variante}" if d.nombre_variante else ""),
                "cantidad": d.cantidad, "precio_unitario_usd": d.precio_unitario_usd,
                "subtotal_usd": d.subtotal_usd, "devuelto": d.devuelto,
            }
            for d in v.detalles
        ],
        "pagos": [
            {"metodo_pago": p.metodo_pago, "moneda": p.moneda, "monto": p.monto, "monto_usd": p.monto_usd}
            for p in v.pagos
        ],
    }


@router.post("/")
def crear_venta(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    data = {
        "tipo": "RAPIDA",
        "cliente_id": null,
        "almacen_id": 1,
        "moneda_display": "USD",
        "tasa_ves": 40.0,
        "tasa_cop": 4000.0,
        "items": [
            {"producto_id": 1, "variante_id": null, "cantidad": 2,
             "precio_unitario_usd": 5.0, "nombre": "Clasica Carne", "extras_json": null}
        ],
        "pagos": [
            {"metodo_pago": "EFECTIVO_USD", "moneda": "USD", "monto": 10.0, "monto_usd": 10.0}
        ]
    }
    """
    # Turno activo — debe ser de la empresa activa, no de cualquier otra
    turno = db.query(TurnoCaja).filter(
        TurnoCaja.usuario_id == user.id,
        TurnoCaja.empresa_id == empresa_id,
        TurnoCaja.estado == "ABIERTO"
    ).first()
    if not turno:
        raise HTTPException(400, "No tienes un turno de caja abierto para esta empresa")

    almacen_id = data.get("almacen_id", 1)
    items = data.get("items", [])
    pagos = data.get("pagos", [])

    numero = _generar_numero_venta(db, empresa_id)
    venta = Venta(
        empresa_id=empresa_id,
        numero_venta=numero,
        tipo=data.get("tipo", "RAPIDA"),
        estado="CERRADA",
        cliente_id=data.get("cliente_id"),
        usuario_id=user.id,
        mesa_id=data.get("mesa_id"),
        almacen_id=almacen_id,
        moneda_display=data.get("moneda_display", "USD"),
        total_pagado_usd=sum(p["monto_usd"] for p in pagos),
        tasa_ves=data.get("tasa_ves"),
        tasa_cop=data.get("tasa_cop"),
        fecha_venta=datetime.now()
    )
    db.add(venta)
    db.flush()  # para obtener venta.id

    # Insertar detalles, procesar extras y descontar inventario
    subtotal = 0.0
    for item in items:
        extras_precio, extras_nombres = _procesar_extras(
            db, item.get("extras", []), item["cantidad"], user.id, almacen_id, venta.id
        )
        linea_total = item["precio_unitario_usd"] * item["cantidad"] + extras_precio
        subtotal += linea_total

        dv = DetalleVenta(
            venta_id=venta.id,
            producto_id=item["producto_id"],
            variante_id=item.get("variante_id"),
            cantidad=item["cantidad"],
            precio_unitario_usd=item["precio_unitario_usd"],
            subtotal_usd=linea_total,
            total_usd=linea_total,
            moneda_display=data.get("moneda_display", "USD"),
            precio_display=item["precio_unitario_usd"],
            tasa_usada=1.0,
            nombre_producto=item.get("nombre", ""),
            extras_json=(", ".join(extras_nombres) if extras_nombres else None),
            extras_precio_usd=extras_precio,
        )
        db.add(dv)
        _descontar_inventario(db, item["producto_id"], item.get("variante_id"),
                               item["cantidad"], user.id, almacen_id, venta.id)

    venta.subtotal_usd = subtotal
    venta.total_usd = subtotal  # sin descuento por ahora

    # Insertar pagos
    for pago in pagos:
        db.add(PagoVenta(
            venta_id=venta.id,
            metodo_pago=pago["metodo_pago"],
            moneda=pago["moneda"],
            monto=pago["monto"],
            monto_usd=pago["monto_usd"],
            tasa_usada=pago.get("tasa_usada", 1.0)
        ))

    db.commit()
    return {"id": venta.id, "numero_venta": numero, "total_usd": venta.total_usd}


@router.post("/{venta_id}/anular")
def anular_venta(
    venta_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    venta = db.query(Venta).filter(Venta.id == venta_id, Venta.empresa_id == empresa_id).first()
    if not venta:
        raise HTTPException(404, "Venta no encontrada")
    if venta.anulada:
        raise HTTPException(400, "La venta ya está anulada")

    venta.anulada = True
    venta.anulada_por = user.id
    venta.motivo_anulacion = data.get("motivo", "Sin motivo")
    venta.anulada_en = datetime.now()
    venta.estado = "ANULADA"

    # Devolver inventario
    for dv in venta.detalles:
        _descontar_inventario(db, dv.producto_id, dv.variante_id,
                               -dv.cantidad, user.id, venta.almacen_id, venta_id)

    db.commit()
    return {"ok": True}
