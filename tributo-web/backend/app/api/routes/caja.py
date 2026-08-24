from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import TurnoCaja, EgresoCaja, IngresoCaja

router = APIRouter()

@router.get("/turno/activo")
def turno_activo(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    turno = db.query(TurnoCaja).filter(
        TurnoCaja.usuario_id == user.id,
        TurnoCaja.empresa_id == empresa_id,
        TurnoCaja.estado == "ABIERTO"
    ).first()
    if not turno:
        return {"turno": None}
    return {"turno": {"id": turno.id, "abierto_en": turno.abierto_en,
                       "fondo_inicial_usd": turno.fondo_inicial_usd}}

@router.post("/turno/abrir")
def abrir_turno(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    existente = db.query(TurnoCaja).filter(
        TurnoCaja.usuario_id == user.id,
        TurnoCaja.empresa_id == empresa_id,
        TurnoCaja.estado == "ABIERTO"
    ).first()
    if existente:
        raise HTTPException(400, "Ya tienes un turno abierto en esta empresa")
    turno = TurnoCaja(
        empresa_id=empresa_id,
        usuario_id=user.id,
        almacen_id=data.get("almacen_id", 1),
        fondo_inicial_usd=data.get("fondo_usd", 0),
        fondo_inicial_ves=data.get("fondo_ves", 0),
        fondo_inicial_cop=data.get("fondo_cop", 0),
    )
    db.add(turno); db.commit(); db.refresh(turno)
    return {"id": turno.id}

@router.post("/turno/{turno_id}/cerrar")
def cerrar_turno(
    turno_id: int, data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    turno = db.query(TurnoCaja).filter(
        TurnoCaja.id == turno_id, TurnoCaja.empresa_id == empresa_id
    ).first()
    if not turno:
        raise HTTPException(404, "Turno no encontrado")
    turno.estado = "CERRADO"
    turno.cerrado_en = datetime.now()
    turno.notas_cierre = data.get("notas")
    turno.efectivo_real_usd = data.get("efectivo_usd", 0)
    turno.efectivo_real_cop = data.get("efectivo_cop", 0)
    db.commit()
    return {"ok": True}

@router.post("/egreso")
def registrar_egreso(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    e = EgresoCaja(
        empresa_id=empresa_id,
        turno_id=data.get("turno_id"),
        usuario_id=user.id,
        categoria=data.get("categoria", "GASTO_ADMIN"),
        concepto=data["concepto"],
        monto_usd=data.get("monto_usd", 0),
        moneda=data.get("moneda", "USD"),
        monto_moneda=data.get("monto_moneda", 0),
        metodo_pago=data.get("metodo_pago"),
        notas=data.get("notas")
    )
    db.add(e); db.commit()
    return {"id": e.id}

@router.post("/ingreso")
def registrar_ingreso(
    data: dict, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    user=Depends(get_current_user)
):
    i = IngresoCaja(
        empresa_id=empresa_id,
        turno_id=data.get("turno_id"),
        usuario_id=user.id,
        categoria=data.get("categoria", "OTRO"),
        concepto=data["concepto"],
        monto_usd=data.get("monto_usd", 0),
        moneda=data.get("moneda", "USD"),
        monto_moneda=data.get("monto_moneda", 0),
        notas=data.get("notas")
    )
    db.add(i); db.commit()
    return {"id": i.id}

@router.get("/egresos")
def listar_egresos(
    desde: str = None, hasta: str = None, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    q = db.query(EgresoCaja).filter(EgresoCaja.empresa_id == empresa_id).order_by(EgresoCaja.fecha.desc())
    if desde: q = q.filter(EgresoCaja.fecha >= desde)
    if hasta: q = q.filter(EgresoCaja.fecha <= hasta + " 23:59:59")
    return q.limit(200).all()
