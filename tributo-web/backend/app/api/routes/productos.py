from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Producto, ProductoVariante, Categoria, Inventario, Extra, ProductoExtra, VarianteIngredientes

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

    # Extras asignados por producto (un solo query para todos, evita N+1)
    extras_por_producto = {}
    filas_extras = db.query(ProductoExtra, Extra).join(
        Extra, ProductoExtra.extra_id == Extra.id
    ).filter(Extra.empresa_id == empresa_id, Extra.activo == True).all()
    for pe, ex in filas_extras:
        extras_por_producto.setdefault(pe.producto_id, []).append(
            {"id": ex.id, "nombre": ex.nombre, "precio_usd": ex.precio_usd}
        )

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
            ],
            "extras": extras_por_producto.get(p.id, []),
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


# ---------- Extras / Adicionales ----------

@router.get("/extras/lista")
def listar_extras(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    extras = db.query(Extra).filter(Extra.empresa_id == empresa_id, Extra.activo == True).order_by(Extra.nombre).all()
    return [
        {"id": e.id, "nombre": e.nombre, "precio_usd": e.precio_usd, "ingrediente_id": e.ingrediente_id}
        for e in extras
    ]


@router.post("/extras")
def crear_extra(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    if not data.get("nombre"):
        raise HTTPException(400, "El nombre es obligatorio")
    e = Extra(
        empresa_id=empresa_id, nombre=data["nombre"],
        precio_usd=data.get("precio_usd", 0), ingrediente_id=data.get("ingrediente_id"),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "nombre": e.nombre}


@router.delete("/extras/{extra_id}")
def eliminar_extra(
    extra_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    e = db.query(Extra).filter(Extra.id == extra_id, Extra.empresa_id == empresa_id).first()
    if not e:
        raise HTTPException(404, "Extra no encontrado")
    e.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{producto_id}/extras/{extra_id}")
def asignar_extra(
    producto_id: int, extra_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    prod = db.query(Producto).filter(Producto.id == producto_id, Producto.empresa_id == empresa_id).first()
    extra = db.query(Extra).filter(Extra.id == extra_id, Extra.empresa_id == empresa_id).first()
    if not prod or not extra:
        raise HTTPException(404, "Producto o extra no encontrado")
    existente = db.query(ProductoExtra).filter(
        ProductoExtra.producto_id == producto_id, ProductoExtra.extra_id == extra_id
    ).first()
    if existente:
        return {"ok": True}
    db.add(ProductoExtra(producto_id=producto_id, extra_id=extra_id))
    db.commit()
    return {"ok": True}


@router.delete("/{producto_id}/extras/{extra_id}")
def quitar_extra(
    producto_id: int, extra_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    pe = db.query(ProductoExtra).join(Producto).filter(
        ProductoExtra.producto_id == producto_id, ProductoExtra.extra_id == extra_id,
        Producto.empresa_id == empresa_id
    ).first()
    if pe:
        db.delete(pe)
        db.commit()
    return {"ok": True}


# ---------- Ingredientes por variante ----------

@router.get("/variantes/{variante_id}/ingredientes")
def listar_ingredientes_variante(
    variante_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    variante = db.query(ProductoVariante).join(Producto).filter(
        ProductoVariante.id == variante_id, Producto.empresa_id == empresa_id
    ).first()
    if not variante:
        raise HTTPException(404, "Variante no encontrada")
    filas = db.query(VarianteIngredientes, Producto).join(
        Producto, VarianteIngredientes.ingrediente_id == Producto.id
    ).filter(VarianteIngredientes.variante_id == variante_id).all()
    return [
        {"id": vi.id, "ingrediente_id": vi.ingrediente_id, "nombre": prod.nombre, "cantidad": vi.cantidad}
        for vi, prod in filas
    ]


@router.put("/variantes/{variante_id}/ingredientes")
def guardar_ingredientes_variante(
    variante_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Reemplaza por completo la lista de ingredientes de esta variante.
    Si una variante NO tiene ingredientes propios aquí, al venderla se
    usa la receta base del producto (comportamiento normal). Esto es
    para cuando una variante especifica (ej: "Doble Carne") necesita
    una lista de ingredientes distinta a la del producto base.
    data = {"ingredientes": [{"ingrediente_id": 5, "cantidad": 200}]}
    """
    variante = db.query(ProductoVariante).join(Producto).filter(
        ProductoVariante.id == variante_id, Producto.empresa_id == empresa_id
    ).first()
    if not variante:
        raise HTTPException(404, "Variante no encontrada")

    db.query(VarianteIngredientes).filter(VarianteIngredientes.variante_id == variante_id).delete()
    for ing in data.get("ingredientes", []):
        db.add(VarianteIngredientes(
            variante_id=variante_id, ingrediente_id=ing["ingrediente_id"], cantidad=ing["cantidad"]
        ))
    db.commit()
    return {"ok": True}
