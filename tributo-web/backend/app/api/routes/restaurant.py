from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.api.routes.ventas import _descontar_inventario, _generar_numero_venta
from app.models.models import Mesa, Venta, DetalleVenta, PagoVenta

router = APIRouter()

# ---------- Pedidos para llevar ----------
# Reutilizan la tabla de Ventas (tipo='LLEVAR'), con un flujo de estados
# propio: PENDIENTE -> EN_PREPARACION -> LISTO -> CERRADA (al cobrar).
# No necesitan mesa ni migracion de base de datos nueva.

PEDIDO_ESTADOS = ["PENDIENTE", "EN_PREPARACION", "LISTO"]


@router.get("/pedidos")
def listar_pedidos(
    incluir_cerrados: bool = False,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Venta).filter(Venta.empresa_id == empresa_id, Venta.tipo == "LLEVAR")
    if not incluir_cerrados:
        q = q.filter(Venta.estado.in_(PEDIDO_ESTADOS))
    ventas = q.order_by(Venta.fecha_venta.desc()).limit(100).all()
    return [
        {
            "id": v.id, "numero_venta": v.numero_venta, "estado": v.estado,
            "total_usd": v.total_usd, "notas": v.notas, "fecha_venta": v.fecha_venta,
        }
        for v in ventas
    ]


@router.post("/pedidos")
def crear_pedido(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    data = {
        "cliente_nombre": "Juan", "telefono": "0414...",
        "items": [{"producto_id": 1, "variante_id": null, "cantidad": 2,
                   "precio_unitario_usd": 5.0, "nombre": "Clasica"}],
        "almacen_id": 1
    }
    Descuenta inventario de inmediato (igual que una comanda de mesa).
    """
    items = data.get("items", [])
    if not items:
        raise HTTPException(400, "El pedido necesita al menos un item")

    almacen_id = data.get("almacen_id", 1)
    subtotal = sum(i["precio_unitario_usd"] * i["cantidad"] for i in items)
    numero = _generar_numero_venta(db, empresa_id)

    nombre_cliente = data.get("cliente_nombre", "").strip()
    telefono = data.get("telefono", "").strip()
    notas = f"Cliente: {nombre_cliente or 'Sin nombre'}" + (f" · Tel: {telefono}" if telefono else "")

    venta = Venta(
        empresa_id=empresa_id, numero_venta=numero, tipo="LLEVAR", estado="PENDIENTE",
        usuario_id=user.id, almacen_id=almacen_id, moneda_display="USD",
        subtotal_usd=subtotal, total_usd=subtotal, notas=notas,
        fecha_venta=datetime.now()
    )
    db.add(venta)
    db.flush()

    for item in items:
        db.add(DetalleVenta(
            venta_id=venta.id, producto_id=item["producto_id"], variante_id=item.get("variante_id"),
            cantidad=item["cantidad"], precio_unitario_usd=item["precio_unitario_usd"],
            subtotal_usd=item["precio_unitario_usd"] * item["cantidad"],
            total_usd=item["precio_unitario_usd"] * item["cantidad"],
            moneda_display="USD", precio_display=item["precio_unitario_usd"], tasa_usada=1.0,
            nombre_producto=item.get("nombre", ""),
        ))
        _descontar_inventario(db, item["producto_id"], item.get("variante_id"),
                               item["cantidad"], user.id, almacen_id, venta.id)

    db.commit()
    return {"id": venta.id, "numero_venta": numero}


@router.put("/pedidos/{venta_id}/estado")
def cambiar_estado_pedido(
    venta_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    nuevo_estado = data.get("estado")
    if nuevo_estado not in PEDIDO_ESTADOS:
        raise HTTPException(400, f"Estado inválido, debe ser uno de: {PEDIDO_ESTADOS}")
    venta = db.query(Venta).filter(
        Venta.id == venta_id, Venta.empresa_id == empresa_id, Venta.tipo == "LLEVAR"
    ).first()
    if not venta:
        raise HTTPException(404, "Pedido no encontrado")
    venta.estado = nuevo_estado
    db.commit()
    return {"ok": True}


@router.post("/pedidos/{venta_id}/cobrar")
def cobrar_pedido(
    venta_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    venta = db.query(Venta).filter(
        Venta.id == venta_id, Venta.empresa_id == empresa_id, Venta.tipo == "LLEVAR"
    ).first()
    if not venta:
        raise HTTPException(404, "Pedido no encontrado")
    if venta.estado not in PEDIDO_ESTADOS:
        raise HTTPException(400, "Este pedido ya fue cobrado o anulado")

    pagos = data.get("pagos", [])
    if not pagos:
        raise HTTPException(400, "Debe indicar al menos un método de pago")

    for pago in pagos:
        db.add(PagoVenta(
            venta_id=venta.id, metodo_pago=pago["metodo_pago"], moneda=pago["moneda"],
            monto=pago["monto"], monto_usd=pago["monto_usd"], tasa_usada=pago.get("tasa_usada", 1.0)
        ))

    venta.total_pagado_usd = sum(p["monto_usd"] for p in pagos)
    venta.tasa_ves = data.get("tasa_ves")
    venta.tasa_cop = data.get("tasa_cop")
    venta.estado = "CERRADA"
    venta.cerrada_en = datetime.now()
    db.commit()
    return {"ok": True, "venta_id": venta.id}


@router.post("/pedidos/{venta_id}/anular")
def anular_pedido(
    venta_id: int, data: dict = {}, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    venta = db.query(Venta).options(joinedload(Venta.detalles)).filter(
        Venta.id == venta_id, Venta.empresa_id == empresa_id, Venta.tipo == "LLEVAR"
    ).first()
    if not venta:
        raise HTTPException(404, "Pedido no encontrado")
    if venta.estado not in PEDIDO_ESTADOS:
        raise HTTPException(400, "Este pedido ya está cerrado")

    for dv in venta.detalles:
        _descontar_inventario(db, dv.producto_id, dv.variante_id, -dv.cantidad,
                               user.id, venta.almacen_id, venta.id)

    venta.anulada = True
    venta.anulada_por = user.id
    venta.motivo_anulacion = data.get("motivo", "Pedido cancelado")
    venta.anulada_en = datetime.now()
    venta.estado = "ANULADA"
    db.commit()
    return {"ok": True}


# ---------- Mesas ----------


@router.get("/mesas")
def listar_mesas(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    mesas = db.query(Mesa).filter(
        Mesa.activo == True, Mesa.empresa_id == empresa_id
    ).order_by(Mesa.numero).all()
    result = []
    for m in mesas:
        total = 0.0
        if m.venta_activa_id:
            v = db.query(Venta).filter(Venta.id == m.venta_activa_id).first()
            total = v.total_usd if v else 0.0
        result.append({
            "id": m.id, "numero": m.numero, "nombre": m.nombre,
            "capacidad": m.capacidad, "estado": m.estado, "zona": m.zona,
            "venta_activa_id": m.venta_activa_id, "total_usd": total
        })
    return result


def _get_mesa(db, mesa_id, empresa_id):
    mesa = db.query(Mesa).filter(
        Mesa.id == mesa_id, Mesa.activo == True, Mesa.empresa_id == empresa_id
    ).first()
    if not mesa:
        raise HTTPException(404, "Mesa no encontrada")
    return mesa


def _recalcular_totales(db, venta):
    subtotal = sum(d.subtotal_usd for d in venta.detalles if not d.devuelto)
    venta.subtotal_usd = subtotal
    venta.total_usd = subtotal


@router.post("/mesas/{mesa_id}/abrir")
def abrir_mesa(
    mesa_id: int, data: dict = {}, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    mesa = _get_mesa(db, mesa_id, empresa_id)

    # Si ya hay una venta activa en esta mesa, la reutilizamos (idempotente)
    if mesa.venta_activa_id:
        venta = db.query(Venta).filter(Venta.id == mesa.venta_activa_id).first()
        if venta and venta.estado == "ABIERTA":
            return {"venta_id": venta.id, "numero_venta": venta.numero_venta}

    numero = _generar_numero_venta(db, empresa_id)
    venta = Venta(
        empresa_id=empresa_id,
        numero_venta=numero,
        tipo="MESA",
        estado="ABIERTA",
        usuario_id=user.id,
        mesa_id=mesa.id,
        almacen_id=data.get("almacen_id", 1),
        moneda_display=data.get("moneda_display", "USD"),
        fecha_venta=datetime.now()
    )
    db.add(venta)
    db.flush()

    mesa.estado = "OCUPADA"
    mesa.venta_activa_id = venta.id
    db.commit()
    return {"venta_id": venta.id, "numero_venta": numero}


@router.get("/mesas/{mesa_id}/cuenta")
def ver_cuenta(
    mesa_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    mesa = _get_mesa(db, mesa_id, empresa_id)
    if not mesa.venta_activa_id:
        return {"mesa_id": mesa.id, "venta_id": None, "items": [], "total_usd": 0}

    venta = db.query(Venta).options(joinedload(Venta.detalles)).filter(
        Venta.id == mesa.venta_activa_id
    ).first()
    if not venta:
        return {"mesa_id": mesa.id, "venta_id": None, "items": [], "total_usd": 0}

    items = [{
        "id": d.id, "producto_id": d.producto_id, "variante_id": d.variante_id,
        "nombre": d.nombre_producto + (f" {d.nombre_variante}" if d.nombre_variante else ""),
        "cantidad": d.cantidad, "precio_unitario_usd": d.precio_unitario_usd,
        "subtotal_usd": d.subtotal_usd, "devuelto": d.devuelto
    } for d in venta.detalles if not d.devuelto]

    return {
        "mesa_id": mesa.id, "venta_id": venta.id, "numero_venta": venta.numero_venta,
        "items": items, "total_usd": venta.total_usd
    }


@router.post("/mesas/{mesa_id}/items")
def agregar_items(
    mesa_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    mesa = _get_mesa(db, mesa_id, empresa_id)
    if not mesa.venta_activa_id:
        raise HTTPException(400, "La mesa no tiene una comanda abierta")

    venta = db.query(Venta).options(joinedload(Venta.detalles)).filter(
        Venta.id == mesa.venta_activa_id
    ).first()
    if not venta or venta.estado != "ABIERTA":
        raise HTTPException(400, "La comanda de esta mesa no está abierta")

    items = data.get("items", [])
    for item in items:
        nombre_variante = item.get("nombre_variante")
        dv = DetalleVenta(
            venta_id=venta.id,
            producto_id=item["producto_id"],
            variante_id=item.get("variante_id"),
            cantidad=item["cantidad"],
            precio_unitario_usd=item["precio_unitario_usd"],
            subtotal_usd=item["precio_unitario_usd"] * item["cantidad"],
            total_usd=item["precio_unitario_usd"] * item["cantidad"],
            moneda_display=venta.moneda_display,
            precio_display=item["precio_unitario_usd"],
            tasa_usada=1.0,
            nombre_producto=item.get("nombre", ""),
            nombre_variante=nombre_variante
        )
        db.add(dv)
        _descontar_inventario(db, item["producto_id"], item.get("variante_id"),
                               item["cantidad"], user.id, venta.almacen_id, venta.id)

    db.flush()
    db.refresh(venta)
    _recalcular_totales(db, venta)
    db.commit()
    return {"ok": True}


@router.delete("/mesas/{mesa_id}/items/{detalle_id}")
def quitar_item(
    mesa_id: int, detalle_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    mesa = _get_mesa(db, mesa_id, empresa_id)
    if not mesa.venta_activa_id:
        raise HTTPException(400, "La mesa no tiene una comanda abierta")

    dv = db.query(DetalleVenta).filter(
        DetalleVenta.id == detalle_id, DetalleVenta.venta_id == mesa.venta_activa_id
    ).first()
    if not dv:
        raise HTTPException(404, "Item no encontrado en esta comanda")

    venta = db.query(Venta).filter(Venta.id == mesa.venta_activa_id).first()

    # Devolver inventario
    _descontar_inventario(db, dv.producto_id, dv.variante_id, -dv.cantidad,
                           user.id, venta.almacen_id, venta.id)
    dv.devuelto = True
    dv.cantidad_devuelta = dv.cantidad

    db.flush()
    db.refresh(venta)
    _recalcular_totales(db, venta)
    db.commit()
    return {"ok": True}


@router.post("/mesas/{mesa_id}/cobrar")
def cobrar_mesa(
    mesa_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    mesa = _get_mesa(db, mesa_id, empresa_id)
    if not mesa.venta_activa_id:
        raise HTTPException(400, "La mesa no tiene una comanda abierta")

    venta = db.query(Venta).filter(Venta.id == mesa.venta_activa_id).first()
    if not venta or venta.estado != "ABIERTA":
        raise HTTPException(400, "La comanda de esta mesa no está abierta")

    pagos = data.get("pagos", [])
    if not pagos:
        raise HTTPException(400, "Debe indicar al menos un método de pago")

    for pago in pagos:
        db.add(PagoVenta(
            venta_id=venta.id,
            metodo_pago=pago["metodo_pago"],
            moneda=pago["moneda"],
            monto=pago["monto"],
            monto_usd=pago["monto_usd"],
            tasa_usada=pago.get("tasa_usada", 1.0)
        ))

    venta.total_pagado_usd = sum(p["monto_usd"] for p in pagos)
    venta.tasa_ves = data.get("tasa_ves")
    venta.tasa_cop = data.get("tasa_cop")
    venta.estado = "CERRADA"
    venta.cerrada_en = datetime.now()

    mesa.estado = "LIBRE"
    mesa.venta_activa_id = None

    db.commit()
    return {"ok": True, "venta_id": venta.id, "numero_venta": venta.numero_venta, "total_usd": venta.total_usd}


@router.post("/mesas/{mesa_id}/liberar")
def liberar_mesa(
    mesa_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """Cancela una comanda abierta que no tiene items (mesa abierta por error)."""
    mesa = _get_mesa(db, mesa_id, empresa_id)
    if not mesa.venta_activa_id:
        mesa.estado = "LIBRE"
        db.commit()
        return {"ok": True}

    venta = db.query(Venta).options(joinedload(Venta.detalles)).filter(
        Venta.id == mesa.venta_activa_id
    ).first()
    if venta and any(not d.devuelto for d in venta.detalles):
        raise HTTPException(400, "La comanda tiene productos, no se puede liberar sin cobrar o vaciar el pedido")

    if venta:
        venta.estado = "ANULADA"
        venta.anulada = True
        venta.anulada_por = user.id
        venta.motivo_anulacion = "Mesa liberada sin consumo"
        venta.anulada_en = datetime.now()

    mesa.estado = "LIBRE"
    mesa.venta_activa_id = None
    db.commit()
    return {"ok": True}
