from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Cliente
router = APIRouter()

@router.get("/")
def listar(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Cliente).filter(Cliente.activo == True).order_by(Cliente.nombre).all()
