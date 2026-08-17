from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Compra
router = APIRouter()

@router.get("/")
def listar(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Compra).order_by(Compra.fecha_compra.desc()).limit(100).all()
