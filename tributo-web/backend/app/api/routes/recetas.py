from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Receta, DetalleReceta, Producto

router = APIRouter()


def _costo_receta(receta: Receta) -> float:
    """Costo total de producir 1 unidad de rendimiento de la receta."""
    if not receta or not receta.ingredientes:
        return 0.0
    total = sum(
        (ing.ingrediente.precio_costo_usd or 0) * ing.cantidad
        for ing in receta.ingredientes if ing.ingrediente
    )
    rendimiento = receta.rendimiento or 1
    return round(total / rendimiento, 4)


@router.get("/")
def listar_recetas(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Lista todos los productos de venta con receta activa (tipo_producto='VENTA'),
    mostrando si ya tienen receta configurada o no — para saber que falta armar.
    """
    productos = db.query(Producto).options(joinedload(Producto.receta)).filter(
        Producto.empresa_id == empresa_id,
        Producto.activo == True,
        Producto.tipo_producto == "VENTA"
    ).order_by(Producto.nombre).all()

    result = []
    for p in productos:
        tiene_receta = p.receta is not None and p.receta.activa
        costo_calculado = _costo_receta(p.receta) if tiene_receta else 0
        result.append({
            "producto_id": p.id,
            "nombre": p.nombre,
            "precio_venta_usd": p.precio_venta_usd,
            "precio_costo_usd": p.precio_costo_usd,
            "tiene_receta": tiene_receta,
            "costo_calculado_usd": costo_calculado,
            "num_ingredientes": len(p.receta.ingredientes) if tiene_receta else 0,
        })
    return result


@router.get("/{producto_id}")
def obtener_receta(
    producto_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    producto = db.query(Producto).filter(
        Producto.id == producto_id, Producto.empresa_id == empresa_id
    ).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado")

    receta = db.query(Receta).options(
        joinedload(Receta.ingredientes).joinedload(DetalleReceta.ingrediente)
    ).filter(Receta.producto_id == producto_id).first()

    if not receta:
        return {
            "producto_id": producto_id, "producto_nombre": producto.nombre,
            "rendimiento": 1, "unidad_rendimiento": producto.unidad, "notas": None,
            "ingredientes": [], "costo_calculado_usd": 0
        }

    return {
        "producto_id": producto_id,
        "producto_nombre": producto.nombre,
        "rendimiento": receta.rendimiento,
        "unidad_rendimiento": receta.unidad_rendimiento,
        "notas": receta.notas,
        "costo_calculado_usd": _costo_receta(receta),
        "ingredientes": [
            {
                "id": ing.id,
                "ingrediente_id": ing.ingrediente_id,
                "nombre": ing.ingrediente.nombre if ing.ingrediente else "?",
                "cantidad": ing.cantidad,
                "unidad": ing.unidad,
                "opcional": ing.opcional,
                "notas": ing.notas,
                "costo_unitario_usd": ing.ingrediente.precio_costo_usd if ing.ingrediente else 0,
                "stock_disponible": None,  # se puede cruzar con /inventario/stock en el frontend si hace falta
            }
            for ing in receta.ingredientes
        ]
    }


@router.put("/{producto_id}")
def guardar_receta(
    producto_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Crea o reemplaza por completo la receta de un producto.
    data = {
        "rendimiento": 1,
        "unidad_rendimiento": "UND",
        "notas": "...",
        "ingredientes": [
            {"ingrediente_id": 5, "cantidad": 150, "unidad": "g", "opcional": false, "notas": ""}
        ]
    }
    """
    producto = db.query(Producto).filter(
        Producto.id == producto_id, Producto.empresa_id == empresa_id
    ).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado")

    ingredientes_in = data.get("ingredientes", [])

    # Validar que todos los ingredientes pertenezcan a la misma empresa
    if ingredientes_in:
        ids = [i["ingrediente_id"] for i in ingredientes_in]
        validos = db.query(Producto.id).filter(
            Producto.id.in_(ids), Producto.empresa_id == empresa_id
        ).all()
        validos_set = {v[0] for v in validos}
        faltantes = set(ids) - validos_set
        if faltantes:
            raise HTTPException(400, f"Ingredientes no válidos para esta empresa: {list(faltantes)}")

    receta = db.query(Receta).filter(Receta.producto_id == producto_id).first()
    if not receta:
        receta = Receta(producto_id=producto_id)
        db.add(receta)
        db.flush()

    receta.rendimiento = data.get("rendimiento", 1)
    receta.unidad_rendimiento = data.get("unidad_rendimiento", producto.unidad)
    receta.notas = data.get("notas")
    receta.activa = True

    # Reemplazar ingredientes por completo (mas simple y seguro que diffear)
    db.query(DetalleReceta).filter(DetalleReceta.receta_id == receta.id).delete()
    for ing in ingredientes_in:
        db.add(DetalleReceta(
            receta_id=receta.id,
            ingrediente_id=ing["ingrediente_id"],
            cantidad=ing["cantidad"],
            unidad=ing.get("unidad", "UND"),
            opcional=ing.get("opcional", False),
            notas=ing.get("notas"),
        ))

    db.commit()
    db.refresh(receta)

    costo = _costo_receta(
        db.query(Receta).options(
            joinedload(Receta.ingredientes).joinedload(DetalleReceta.ingrediente)
        ).filter(Receta.id == receta.id).first()
    )
    return {"ok": True, "receta_id": receta.id, "costo_calculado_usd": costo}


@router.post("/{producto_id}/sincronizar-costo")
def sincronizar_costo(
    producto_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Copia el costo calculado de la receta al precio_costo_usd del producto,
    para que el resto del sistema (Estado de Resultados, POS) use el costo
    real de la receta en vez de un numero manual desactualizado.
    """
    producto = db.query(Producto).filter(
        Producto.id == producto_id, Producto.empresa_id == empresa_id
    ).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado")

    receta = db.query(Receta).options(
        joinedload(Receta.ingredientes).joinedload(DetalleReceta.ingrediente)
    ).filter(Receta.producto_id == producto_id).first()
    if not receta or not receta.ingredientes:
        raise HTTPException(400, "Este producto no tiene receta configurada")

    costo = _costo_receta(receta)
    producto.precio_costo_usd = costo
    db.commit()
    return {"ok": True, "precio_costo_usd": costo}
