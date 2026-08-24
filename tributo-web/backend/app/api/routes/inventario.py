from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Inventario, MovimientoInventario, Producto, LoteInventario

router = APIRouter()

@router.get("/stock")
def stock_actual(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    rows = db.query(Inventario, Producto).join(
        Producto, Inventario.producto_id == Producto.id
    ).filter(
        Producto.empresa_id == empresa_id,
        Producto.activo == True,
        Producto.tiene_inventario == True
    ).order_by(Producto.nombre).all()
    return [
        {
            "producto_id": inv.producto_id,
            "nombre": prod.nombre,
            "cantidad": inv.cantidad,
            "unidad": prod.unidad,
            "stock_minimo": prod.stock_minimo,
            "stock_critico": prod.stock_critico,
            "estado": "CRITICO" if inv.cantidad <= prod.stock_critico
                      else "BAJO" if inv.cantidad <= prod.stock_minimo
                      else "OK"
        }
        for inv, prod in rows
    ]


@router.get("/valorizacion")
def valorizacion_inventario(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Cuanto capital hay atado en inventario ahora mismo, usando el costo
    REAL de cada lote FIFO que todavia tiene cantidad disponible — no
    un precio generico. Sirve para ver de un vistazo cuanto dinero
    tienes "guardado" en insumos sin vender/consumir todavia.
    """
    rows = db.query(
        LoteInventario.producto_id,
        func.sum(LoteInventario.cantidad_disponible).label("cantidad"),
        func.sum(LoteInventario.cantidad_disponible * LoteInventario.costo_unitario_usd).label("valor")
    ).filter(
        LoteInventario.empresa_id == empresa_id,
        LoteInventario.cantidad_disponible > 0
    ).group_by(LoteInventario.producto_id).all()

    productos = {p.id: p for p in db.query(Producto).filter(Producto.empresa_id == empresa_id).all()}

    items = []
    for producto_id, cantidad, valor in rows:
        prod = productos.get(producto_id)
        if not prod or cantidad <= 0:
            continue
        items.append({
            "producto_id": producto_id,
            "nombre": prod.nombre,
            "cantidad": cantidad,
            "unidad": prod.unidad,
            "costo_promedio_usd": round(valor / cantidad, 4) if cantidad else 0,
            "valor_total_usd": round(valor, 2),
        })
    items.sort(key=lambda i: i["valor_total_usd"], reverse=True)

    return {
        "items": items,
        "valor_total_inventario_usd": round(sum(i["valor_total_usd"] for i in items), 2)
    }

@router.get("/kardex/{producto_id}")
def kardex(
    producto_id: int, limit: int = 100, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    # Verificar que el producto pertenece a la empresa activa antes de mostrar su historial
    prod = db.query(Producto).filter(
        Producto.id == producto_id, Producto.empresa_id == empresa_id
    ).first()
    if not prod:
        raise HTTPException(404, "Producto no encontrado")

    movs = db.query(MovimientoInventario).filter(
        MovimientoInventario.producto_id == producto_id
    ).order_by(desc(MovimientoInventario.id)).limit(limit).all()
    return [
        {
            "id": m.id,
            "tipo": m.tipo,
            "cantidad": m.cantidad,
            "cantidad_antes": m.cantidad_antes,
            "cantidad_despues": m.cantidad_despues,
            "referencia_tipo": m.referencia_tipo,
            "referencia_id": m.referencia_id,
            "costo_usd": m.costo_usd,
            "creado_en": m.creado_en,
            "notas": m.notas
        }
        for m in movs
    ]
