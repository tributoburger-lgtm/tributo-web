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
    VarianteIngredientes, TurnoCaja
)

router = APIRouter()


def _generar_numero_venta(db: Session, empresa_id: int) -> str:
    from sqlalchemy import func
    count = db.query(func.count(Venta.id)).filter(Venta.empresa_id == empresa_id).scalar() or 0
    ahora = datetime.now()
    return f"SAPOS-{ahora.strftime('%Y%m%d')}-{str(count+1).zfill(6)}"


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


def _ajustar_stock(db, producto_id, delta, tipo, usuario_id, almacen_id, ref_tipo, ref_id) -> float:
    """Ajusta stock FIFO y registra movimiento. Retorna costo unitario."""
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
        inv = Inventario(
            producto_id=producto_id, almacen_id=almacen_id,
            cantidad=despues
        )
        db.add(inv)

    prod = db.query(Producto).filter(Producto.id == producto_id).first()
    costo = prod.precio_costo_usd if prod else 0

    mov = MovimientoInventario(
        producto_id=producto_id,
        almacen_id=almacen_id,
        tipo=tipo,
        cantidad=abs(delta),
        cantidad_antes=antes,
        cantidad_despues=despues,
        referencia_tipo=ref_tipo,
        referencia_id=ref_id,
        costo_usd=costo,
        usuario_id=usuario_id
    )
    db.add(mov)
    return costo * abs(delta)


@router.get("/")
def listar_ventas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    estado: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Venta).filter(Venta.empresa_id == empresa_id).order_by(desc(Venta.fecha_venta))
    if desde:
        q = q.filter(Venta.fecha_venta >= desde)
    if hasta:
        q = q.filter(Venta.fecha_venta <= hasta + " 23:59:59")
    if estado:
        q = q.filter(Venta.estado == estado)
    ventas = q.limit(limit).all()
    return [{"id": v.id, "numero_venta": v.numero_venta, "total_usd": v.total_usd,
             "estado": v.estado, "fecha_venta": v.fecha_venta, "anulada": v.anulada}
            for v in ventas]


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
    return v


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

    # Calcular totales
    subtotal = sum(i["precio_unitario_usd"] * i["cantidad"] for i in items)
    total = subtotal  # sin descuento por ahora

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
        subtotal_usd=subtotal,
        total_usd=total,
        total_pagado_usd=sum(p["monto_usd"] for p in pagos),
        tasa_ves=data.get("tasa_ves"),
        tasa_cop=data.get("tasa_cop"),
        fecha_venta=datetime.now()
    )
    db.add(venta)
    db.flush()  # para obtener venta.id

    # Insertar detalles y descontar inventario
    for item in items:
        dv = DetalleVenta(
            venta_id=venta.id,
            producto_id=item["producto_id"],
            variante_id=item.get("variante_id"),
            cantidad=item["cantidad"],
            precio_unitario_usd=item["precio_unitario_usd"],
            subtotal_usd=item["precio_unitario_usd"] * item["cantidad"],
            total_usd=item["precio_unitario_usd"] * item["cantidad"],
            moneda_display=data.get("moneda_display", "USD"),
            precio_display=item["precio_unitario_usd"],
            tasa_usada=1.0,
            nombre_producto=item.get("nombre", ""),
            extras_json=item.get("extras_json"),
            extras_precio_usd=item.get("extras_precio_usd", 0)
        )
        db.add(dv)
        _descontar_inventario(db, item["producto_id"], item.get("variante_id"),
                               item["cantidad"], user.id, almacen_id, venta.id)

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
    return {"id": venta.id, "numero_venta": numero, "total_usd": total}


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
