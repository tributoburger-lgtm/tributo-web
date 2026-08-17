from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_token
from app.models.models import Usuario

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    user = db.query(Usuario).filter(Usuario.id == payload.get("sub")).first()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
    return user


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(
        Usuario.username == form.username,
        Usuario.activo == True
    ).first()

    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    # Actualizar último acceso
    user.ultimo_acceso = datetime.now()
    db.commit()

    token = create_access_token({"sub": user.id, "rol": user.rol})
    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": user.id,
            "username": user.username,
            "nombre_completo": user.nombre_completo,
            "rol": user.rol
        }
    }


@router.get("/me")
def me(current_user: Usuario = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "nombre_completo": current_user.nombre_completo,
        "rol": current_user.rol,
        "email": current_user.email
    }
