from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from typing import Optional
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.api.routes.ventas import _ajustar_stock
from app.models.models import Compra, DetalleCompra, Proveedor, Producto

router = APIRouter()


def _generar_numero_compra(db: Session, empresa_id: int) -> str:
    from sqlalchemy import func
    count = db.query(func.count(Compra.id)).filter(Compra.empresa_id == empresa_id).scalar() or 0
    ahora = datetime.now()
    return f"COMPRA-{ahora.strftime('%Y%m%d')}-{str(count+1).zfill(6)}"


# ---------- Proveedores ----------

@router.get("/proveedores")
def listar_proveedores(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    return db.query(Proveedor).filter(
        Proveedor.empresa_id == empresa_id, Proveedor.activo == True
    ).order_by(Proveedor.nombre).all()


@router.post("/proveedores")
def crear_proveedor(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    if not data.get("nombre"):
        raise HTTPException(400, "El nombre del proveedor es obligatorio")
    p = Proveedor(
        empresa_id=empresa_id,
        nombre=data["nombre"],
        rif_nit=data.get("rif_nit"),
        contacto=data.get("contacto"),
        telefono=data.get("telefono"),
        email=data.get("email"),
        direccion=data.get("direccion"),
        moneda_preferida=data.get("moneda_preferida", "USD"),
        notas=data.get("notas"),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "nombre": p.nombre}


# ---------- Compras ----------

@router.get("/")
def listar_compras(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Compra, Proveedor.nombre).outerjoin(
        Proveedor, Compra.proveedor_id == Proveedor.id
    ).filter(Compra.empresa_id == empresa_id)
    if estado:
        q = q.filter(Compra.estado == estado)
    rows = q.order_by(Compra.fecha_compra.desc()).limit(100).all()
    return [
        {
            "id": c.id, "numero_compra": c.numero_compra,
            "proveedor_nombre": prov_nombre or "Sin proveedor",
            "estado": c.estado, "total_usd": c.total_usd,
            "fecha_compra": c.fecha_compra, "fecha_entrega": c.fecha_entrega,
        }
        for c, prov_nombre in rows
    ]


@router.get("/{compra_id}")
def obtener_compra(
    compra_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    compra = db.query(Compra).options(
        joinedload(Compra.detalles).joinedload(DetalleCompra.producto)
    ).filter(Compra.id == compra_id, Compra.empresa_id == empresa_id).first()
    if not compra:
        raise HTTPException(404, "Compra no encontrada")
    proveedor = db.query(Proveedor).filter(Proveedor.id == compra.proveedor_id).first()
    return {
        "id": compra.id, "numero_compra": compra.numero_compra,
        "proveedor_id": compra.proveedor_id,
        "proveedor_nombre": proveedor.nombre if proveedor else "Sin proveedor",
        "estado": compra.estado, "moneda": compra.moneda,
        "subtotal_usd": compra.subtotal_usd, "total_usd": compra.total_usd,
        "fecha_compra": compra.fecha_compra, "fecha_entrega": compra.fecha_entrega,
        "notas": compra.notas,
        "items": [
            {
                "detalle_id": d.id, "producto_id": d.producto_id,
                "nombre": d.producto.nombre if d.producto else "?",
                "cantidad": d.cantidad, "cantidad_recibida": d.cantidad_recibida,
                "precio_unitario_usd": d.precio_unitario_usd, "subtotal_usd": d.subtotal_usd,
            }
            for d in compra.detalles
        ]
    }


@router.post("/")
def crear_compra(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    data = {
        "proveedor_id": 3,
        "almacen_id": 1,
        "moneda": "USD",
        "items": [{"producto_id": 5, "cantidad": 20, "precio_unitario_usd": 1.5}],
        "notas": "..."
    }
    Se crea en estado PENDIENTE — el inventario no se toca todavia,
    solo al "Recibir" la compra.
    """
    items = data.get("items", [])
    if not items:
        raise HTTPException(400, "La compra necesita al menos un item")

    almacen_id = data.get("almacen_id", 1)
    subtotal = sum(i["cantidad"] * i["precio_unitario_usd"] for i in items)
    numero = _generar_numero_compra(db, empresa_id)

    compra = Compra(
        empresa_id=empresa_id,
        numero_compra=numero,
        proveedor_id=data.get("proveedor_id"),
        usuario_id=user.id,
        almacen_id=almacen_id,
        estado="PENDIENTE",
        moneda=data.get("moneda", "USD"),
        subtotal_usd=subtotal,
        iva_usd=0,
        total_usd=subtotal,
        notas=data.get("notas"),
    )
    db.add(compra)
    db.flush()

    for i in items:
        db.add(DetalleCompra(
            compra_id=compra.id,
            producto_id=i["producto_id"],
            cantidad=i["cantidad"],
            cantidad_recibida=0,
            precio_unitario_usd=i["precio_unitario_usd"],
            subtotal_usd=i["cantidad"] * i["precio_unitario_usd"],
        ))

    db.commit()
    return {"id": compra.id, "numero_compra": numero, "total_usd": subtotal}


@router.post("/{compra_id}/recibir")
def recibir_compra(
    compra_id: int, data: dict = {}, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    Marca la compra como recibida y sube el stock automáticamente.
    Por defecto recibe todo lo pedido; opcionalmente se puede pasar
    data = {"items": [{"detalle_id": 1, "cantidad_recibida": 15}]}
    para una recepción parcial.
    """
    compra = db.query(Compra).options(joinedload(Compra.detalles)).filter(
        Compra.id == compra_id, Compra.empresa_id == empresa_id
    ).first()
    if not compra:
        raise HTTPException(404, "Compra no encontrada")
    if compra.estado == "RECIBIDA":
        raise HTTPException(400, "Esta compra ya fue recibida")

    parciales = {i["detalle_id"]: i["cantidad_recibida"] for i in data.get("items", [])}

    for detalle in compra.detalles:
        pendiente = detalle.cantidad - (detalle.cantidad_recibida or 0)
        cantidad_a_recibir = parciales.get(detalle.id, pendiente)
        if cantidad_a_recibir <= 0:
            continue
        _ajustar_stock(
            db, detalle.producto_id, cantidad_a_recibir, "ENTRADA",
            user.id, compra.almacen_id, "COMPRA", compra.id,
            costo_unitario_usd=detalle.precio_unitario_usd
        )
        detalle.cantidad_recibida = (detalle.cantidad_recibida or 0) + cantidad_a_recibir

    todo_recibido = all((d.cantidad_recibida or 0) >= d.cantidad for d in compra.detalles)
    compra.estado = "RECIBIDA" if todo_recibido else "PARCIAL"
    compra.fecha_entrega = datetime.now()

    db.commit()
    return {"ok": True, "estado": compra.estado}
