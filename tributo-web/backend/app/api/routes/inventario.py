from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.api.routes.ventas import _ajustar_stock
from app.models.models import Inventario, MovimientoInventario, Producto, LoteInventario, Fraccionamiento

router = APIRouter()

@router.post("/fraccionar")
def fraccionar(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    Convierte una presentacion grande en unidades mas chicas.
    data = {
        "producto_origen_id": 5, "cantidad_origen": 1,
        "producto_destino_id": 12, "cantidad_destino": 24,
        "almacen_id": 1, "notas": "Caja de huevos -> unidades"
    }
    El costo real (FIFO) que se le quita al origen se reparte entre
    las unidades del destino, para no perder precision de costos.
    """
    origen = db.query(Producto).filter(
        Producto.id == data.get("producto_origen_id"), Producto.empresa_id == empresa_id
    ).first()
    destino = db.query(Producto).filter(
        Producto.id == data.get("producto_destino_id"), Producto.empresa_id == empresa_id
    ).first()
    if not origen or not destino:
        raise HTTPException(404, "Producto origen o destino no encontrado")
    if origen.id == destino.id:
        raise HTTPException(400, "El origen y el destino no pueden ser el mismo producto")

    cantidad_origen = data.get("cantidad_origen")
    cantidad_destino = data.get("cantidad_destino")
    if not cantidad_origen or not cantidad_destino or cantidad_origen <= 0 or cantidad_destino <= 0:
        raise HTTPException(400, "Las cantidades deben ser mayores a 0")

    almacen_id = data.get("almacen_id", 1)

    frac = Fraccionamiento(
        empresa_id=empresa_id, producto_origen_id=origen.id, cantidad_origen=cantidad_origen,
        producto_destino_id=destino.id, cantidad_destino=cantidad_destino,
        usuario_id=user.id, almacen_id=almacen_id, notas=data.get("notas"),
    )
    db.add(frac)
    db.flush()

    costo_total = _ajustar_stock(
        db, origen.id, -cantidad_origen, "SALIDA", user.id, almacen_id,
        "FRACCIONAMIENTO", frac.id
    )
    costo_unitario_destino = costo_total / cantidad_destino
    _ajustar_stock(
        db, destino.id, cantidad_destino, "ENTRADA", user.id, almacen_id,
        "FRACCIONAMIENTO", frac.id, costo_unitario_usd=costo_unitario_destino
    )
    frac.costo_total_usd = costo_total

    db.commit()
    return {"ok": True, "id": frac.id, "costo_total_usd": costo_total}


@router.get("/fraccionamientos")
def listar_fraccionamientos(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    rows = db.query(Fraccionamiento).filter(
        Fraccionamiento.empresa_id == empresa_id
    ).order_by(Fraccionamiento.fecha.desc()).limit(100).all()
    productos = {p.id: p.nombre for p in db.query(Producto).filter(Producto.empresa_id == empresa_id).all()}
    return [
        {
            "id": f.id, "origen_nombre": productos.get(f.producto_origen_id, "?"),
            "cantidad_origen": f.cantidad_origen,
            "destino_nombre": productos.get(f.producto_destino_id, "?"),
            "cantidad_destino": f.cantidad_destino,
            "costo_total_usd": f.costo_total_usd, "fecha": f.fecha,
            "notas": f.notas, "revertido": f.revertido,
        }
        for f in rows
    ]


@router.post("/fraccionamientos/{frac_id}/revertir")
def revertir_fraccionamiento(
    frac_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    frac = db.query(Fraccionamiento).filter(
        Fraccionamiento.id == frac_id, Fraccionamiento.empresa_id == empresa_id
    ).first()
    if not frac:
        raise HTTPException(404, "Fraccionamiento no encontrado")
    if frac.revertido:
        raise HTTPException(400, "Ya fue revertido")

    # Devolver al origen (a costo promedio del fraccionamiento original)
    costo_unit_origen = frac.costo_total_usd / frac.cantidad_origen if frac.cantidad_origen else 0
    _ajustar_stock(
        db, frac.producto_origen_id, frac.cantidad_origen, "ENTRADA", user.id,
        frac.almacen_id, "REVERSION_FRACCIONAMIENTO", frac.id,
        costo_unitario_usd=costo_unit_origen
    )
    # Quitar del destino
    _ajustar_stock(
        db, frac.producto_destino_id, -frac.cantidad_destino, "SALIDA", user.id,
        frac.almacen_id, "REVERSION_FRACCIONAMIENTO", frac.id
    )
    frac.revertido = True
    db.commit()
    return {"ok": True}


@router.post("/ajuste")
def ajustar_inventario(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    """
    Corrige el stock de un producto a la cantidad real que contaste
    fisicamente (no suma/resta, tu dices cual es el numero correcto).
    data = {"producto_id": 5, "cantidad_real": 18.5, "motivo": "...", "almacen_id": 1}
    """
    producto = db.query(Producto).filter(
        Producto.id == data.get("producto_id"), Producto.empresa_id == empresa_id
    ).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado")

    almacen_id = data.get("almacen_id", 1)
    cantidad_real = data.get("cantidad_real")
    if cantidad_real is None:
        raise HTTPException(400, "Debes indicar la cantidad real contada")

    inv = db.query(Inventario).filter(
        Inventario.producto_id == producto.id, Inventario.almacen_id == almacen_id
    ).first()
    cantidad_actual = inv.cantidad if inv else 0.0
    delta = cantidad_real - cantidad_actual

    if delta == 0:
        raise HTTPException(400, "No hay diferencia entre el stock actual y la cantidad contada")

    costo_total = _ajustar_stock(
        db, producto.id, delta, "AJUSTE", user.id, almacen_id,
        "AJUSTE_MANUAL", None
    )
    # Guardar el motivo en el movimiento recien creado
    mov = db.query(MovimientoInventario).order_by(desc(MovimientoInventario.id)).first()
    if mov:
        mov.notas = data.get("motivo", "Ajuste manual")

    db.commit()
    return {"ok": True, "cantidad_anterior": cantidad_actual, "cantidad_nueva": cantidad_real, "delta": delta}


@router.get("/stock")
def stock_actual(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    """
    Muestra TODOS los productos activos, incluyendo los que tienen
    tiene_inventario=False (como algunas hamburguesas o extras que
    solo se controlan por receta) — esos salen marcados como "Sin
    seguimiento" en vez de OK/BAJO/CRITICO, pero siguen siendo
    clicables para ver su Kardex si tuvieron algun movimiento.
    """
    rows = db.query(Producto, Inventario).outerjoin(
        Inventario, (Inventario.producto_id == Producto.id) & (Inventario.variante_id == None)
    ).filter(
        Producto.empresa_id == empresa_id,
        Producto.activo == True,
    ).order_by(Producto.nombre).all()

    result = []
    for prod, inv in rows:
        cantidad = inv.cantidad if inv else 0.0
        if not prod.tiene_inventario:
            estado = "SIN_SEGUIMIENTO"
        elif cantidad <= prod.stock_critico:
            estado = "CRITICO"
        elif cantidad <= prod.stock_minimo:
            estado = "BAJO"
        else:
            estado = "OK"
        result.append({
            "producto_id": prod.id,
            "nombre": prod.nombre,
            "cantidad": cantidad,
            "unidad": prod.unidad,
            "stock_minimo": prod.stock_minimo,
            "stock_critico": prod.stock_critico,
            "tiene_inventario": prod.tiene_inventario,
            "estado": estado,
        })
    return result


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
