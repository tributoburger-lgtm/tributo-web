from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Inventario, MovimientoInventario, Producto

router = APIRouter()

@router.get("/stock")
def stock_actual(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Inventario, Producto).join(
        Producto, Inventario.producto_id == Producto.id
    ).filter(Producto.activo == True, Producto.tiene_inventario == True).all()
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

@router.get("/kardex/{producto_id}")
def kardex(producto_id: int, limit: int = 100, db: Session = Depends(get_db), _=Depends(get_current_user)):
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
            "creado_en": m.creado_en,
            "notas": m.notas
        }
        for m in movs
    ]
