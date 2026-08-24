from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Producto, ProductoVariante, Categoria, Inventario

router = APIRouter()


@router.get("/")
def listar_productos(
    activo: Optional[bool] = True,
    categoria_id: Optional[int] = None,
    tipo: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Producto).options(
        joinedload(Producto.categoria),
        joinedload(Producto.variantes)
    ).filter(Producto.empresa_id == empresa_id)
    if activo is not None:
        q = q.filter(Producto.activo == activo)
    if categoria_id:
        q = q.filter(Producto.categoria_id == categoria_id)
    if tipo:
        q = q.filter(Producto.tipo_producto == tipo)
    if search:
        q = q.filter(Producto.nombre.ilike(f"%{search}%"))

    productos = q.order_by(Producto.nombre).all()

    result = []
    for p in productos:
        # Stock actual
        inv = db.query(Inventario).filter(
            Inventario.producto_id == p.id,
            Inventario.variante_id == None
        ).first()
        stock = inv.cantidad if inv else 0

        result.append({
            "id": p.id,
            "codigo": p.codigo,
            "nombre": p.nombre,
            "descripcion": p.descripcion,
            "categoria": p.categoria.nombre if p.categoria else None,
            "categoria_id": p.categoria_id,
            "precio_venta_usd": p.precio_venta_usd,
            "precio_costo_usd": p.precio_costo_usd,
            "tiene_inventario": p.tiene_inventario,
            "tiene_variantes": p.tiene_variantes,
            "stock": stock,
            "stock_minimo": p.stock_minimo,
            "stock_critico": p.stock_critico,
            "unidad": p.unidad,
            "tipo_producto": p.tipo_producto,
            "destino_impresion": p.destino_impresion,
            "activo": p.activo,
            "variantes": [
                {
                    "id": v.id,
                    "nombre": v.valor_variante,
                    "tipo": v.tipo_variante,
                    "precio_usd": v.precio_usd,
                    "activo": v.activo
                }
                for v in p.variantes if v.activo
            ]
        })
    return result


@router.get("/{producto_id}")
def obtener_producto(
    producto_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    p = db.query(Producto).options(
        joinedload(Producto.variantes),
        joinedload(Producto.receta)
    ).filter(Producto.id == producto_id, Producto.empresa_id == empresa_id).first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    return p


@router.post("/")
def crear_producto(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    campos = {k: v for k, v in data.items() if hasattr(Producto, k) and k != "empresa_id"}
    p = Producto(**campos, empresa_id=empresa_id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "nombre": p.nombre}


@router.put("/{producto_id}")
def actualizar_producto(
    producto_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    p = db.query(Producto).filter(Producto.id == producto_id, Producto.empresa_id == empresa_id).first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    for k, v in data.items():
        if hasattr(p, k) and k not in ("id", "empresa_id"):
            setattr(p, k, v)
    db.commit()
    return {"ok": True}


@router.get("/categorias/lista")
def listar_categorias(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    cats = db.query(Categoria).filter(
        Categoria.activo == True, Categoria.empresa_id == empresa_id
    ).order_by(Categoria.nombre).all()
    return [
        {"id": c.id, "nombre": c.nombre, "descripcion": c.descripcion,
         "color": c.color, "icono": c.icono}
        for c in cats
    ]


@router.post("/categorias")
def crear_categoria(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    if not data.get("nombre"):
        raise HTTPException(400, "El nombre es obligatorio")
    existente = db.query(Categoria).filter(
        Categoria.empresa_id == empresa_id, Categoria.nombre == data["nombre"]
    ).first()
    if existente:
        raise HTTPException(400, "Ya existe una categoría con ese nombre")
    c = Categoria(
        empresa_id=empresa_id, nombre=data["nombre"],
        descripcion=data.get("descripcion"),
        color=data.get("color", "#4A9EFF"), icono=data.get("icono", "📦"),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "nombre": c.nombre}


@router.put("/categorias/{categoria_id}")
def actualizar_categoria(
    categoria_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    c = db.query(Categoria).filter(
        Categoria.id == categoria_id, Categoria.empresa_id == empresa_id
    ).first()
    if not c:
        raise HTTPException(404, "Categoría no encontrada")
    for k, v in data.items():
        if hasattr(c, k) and k not in ("id", "empresa_id"):
            setattr(c, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/categorias/{categoria_id}")
def eliminar_categoria(
    categoria_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    c = db.query(Categoria).filter(
        Categoria.id == categoria_id, Categoria.empresa_id == empresa_id
    ).first()
    if not c:
        raise HTTPException(404, "Categoría no encontrada")
    en_uso = db.query(Producto).filter(
        Producto.categoria_id == categoria_id, Producto.activo == True
    ).count()
    if en_uso > 0:
        raise HTTPException(400, f"No se puede eliminar: {en_uso} producto(s) todavía la usan")
    c.activo = False
    db.commit()
    return {"ok": True}
