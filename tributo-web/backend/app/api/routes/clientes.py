from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Cliente, Venta

router = APIRouter()


@router.get("/")
def listar_clientes(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(Cliente).filter(Cliente.empresa_id == empresa_id, Cliente.activo == True)
    if search:
        q = q.filter(
            (Cliente.nombre.ilike(f"%{search}%")) | (Cliente.rif_cedula.ilike(f"%{search}%"))
        )
    return q.order_by(Cliente.nombre).all()


@router.get("/{cliente_id}")
def obtener_cliente(
    cliente_id: int, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id, Cliente.empresa_id == empresa_id
    ).first()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    ventas = db.query(Venta).filter(
        Venta.cliente_id == cliente_id, Venta.empresa_id == empresa_id, Venta.anulada == False
    ).order_by(desc(Venta.fecha_venta)).limit(20).all()

    return {
        "id": cliente.id, "nombre": cliente.nombre, "rif_cedula": cliente.rif_cedula,
        "telefono": cliente.telefono, "email": cliente.email, "direccion": cliente.direccion,
        "ciudad": cliente.ciudad, "tipo": cliente.tipo,
        "credito_limite_usd": cliente.credito_limite_usd, "credito_usado_usd": cliente.credito_usado_usd,
        "descuento_fijo_pct": cliente.descuento_fijo_pct, "notas": cliente.notas,
        "ventas_recientes": [
            {"id": v.id, "numero_venta": v.numero_venta, "total_usd": v.total_usd, "fecha_venta": v.fecha_venta}
            for v in ventas
        ],
        "total_comprado_usd": sum(v.total_usd for v in ventas),
    }


@router.post("/")
def crear_cliente(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    if not data.get("nombre"):
        raise HTTPException(400, "El nombre es obligatorio")
    c = Cliente(
        empresa_id=empresa_id,
        nombre=data["nombre"],
        rif_cedula=data.get("rif_cedula"),
        telefono=data.get("telefono"),
        email=data.get("email"),
        direccion=data.get("direccion"),
        ciudad=data.get("ciudad"),
        tipo=data.get("tipo", "NATURAL"),
        credito_limite_usd=data.get("credito_limite_usd", 0),
        descuento_fijo_pct=data.get("descuento_fijo_pct", 0),
        notas=data.get("notas"),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "nombre": c.nombre}


@router.put("/{cliente_id}")
def actualizar_cliente(
    cliente_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    c = db.query(Cliente).filter(Cliente.id == cliente_id, Cliente.empresa_id == empresa_id).first()
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    for k, v in data.items():
        if hasattr(c, k) and k not in ("id", "empresa_id"):
            setattr(c, k, v)
    db.commit()
    return {"ok": True}
