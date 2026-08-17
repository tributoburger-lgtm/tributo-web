from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Mesa
router = APIRouter()

@router.get("/mesas")
def listar_mesas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Mesa).filter(Mesa.activo == True).order_by(Mesa.numero).all()
