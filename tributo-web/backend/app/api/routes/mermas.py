from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.api.routes.ventas import _ajustar_stock
from app.models.models import Merma, Producto

router = APIRouter()

MOTIVOS_VALIDOS = ["Vencido", "Dañado", "Preparación errónea", "Robo/Extravío", "Otro"]


@router.get("/")
def listar_mermas(
    desde: Optional[str] = None, hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Merma, Producto).join(Producto, Merma.producto_id == Producto.id).filter(
        Merma.empresa_id == empresa_id
    )
    if desde:
        q = q.filter(Merma.fecha >= desde)
    if hasta:
        q = q.filter(Merma.fecha <= hasta + " 23:59:59")
    rows = q.order_by(Merma.fecha.desc()).limit(200).all()
    return [
        {
            "id": m.id, "producto_id": m.producto_id, "producto_nombre": p.nombre,
            "cantidad": m.cantidad, "unidad": p.unidad, "motivo": m.motivo,
            "costo_usd": m.costo_usd, "notas": m.notas, "fecha": m.fecha
        }
        for m, p in rows
    ]


@router.post("/")
def registrar_merma(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    data = {
        "producto_id": 5,
        "cantidad": 2.5,
        "motivo": "Vencido",
        "almacen_id": 1,
        "notas": "Se pasó la fecha del insumo"
    }
    El costo se calcula con el precio_costo_usd del producto y descuenta
    el stock automáticamente (queda registrado en el Kardex como SALIDA
    con referencia MERMA).
    """
    producto = db.query(Producto).filter(
        Producto.id == data.get("producto_id"), Producto.empresa_id == empresa_id
    ).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado")

    cantidad = data.get("cantidad")
    if not cantidad or cantidad <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a 0")

    motivo = data.get("motivo", "Otro")
    almacen_id = data.get("almacen_id", 1)

    merma = Merma(
        empresa_id=empresa_id,
        producto_id=producto.id,
        cantidad=cantidad,
        motivo=motivo,
        usuario_id=user.id,
        notas=data.get("notas"),
    )
    db.add(merma)
    db.flush()  # para tener merma.id como referencia del movimiento

    costo_total = _ajustar_stock(
        db, producto.id, -cantidad, "SALIDA", user.id, almacen_id, "MERMA", merma.id
    )
    merma.costo_usd = costo_total

    db.commit()
    return {"id": merma.id, "costo_usd": costo_total}
