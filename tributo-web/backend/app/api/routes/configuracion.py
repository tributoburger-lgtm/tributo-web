from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Configuracion, TasaCambio
router = APIRouter()

@router.get("/tasas")
def tasas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(TasaCambio).filter(TasaCambio.vigente == True).all()

@router.get("/")
def config(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Configuracion).all()
    return {r.clave: r.valor for r in rows}
