from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_token
from app.models.models import Usuario, Empresa, UsuarioEmpresa, EmpresaModulo

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalido o expirado")
    # sub puede venir como int o string
    user_id = payload.get("sub")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalido")
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
    return user


def get_empresa_actual(token: str = Depends(oauth2_scheme)) -> int:
    """
    Extrae la empresa activa del token (con cual empresa esta trabajando
    el usuario en este momento). Cada endpoint que maneja datos de una
    empresa (productos, ventas, caja, etc.) depende de esto para saber
    que filtrar.
    """
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalido o expirado")
    empresa_id = payload.get("empresa_id")
    try:
        return int(empresa_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="El token no tiene una empresa activa, vuelve a iniciar sesion")


def _empresas_del_usuario(db: Session, usuario_id: int):
    return (
        db.query(Empresa)
        .join(UsuarioEmpresa, UsuarioEmpresa.empresa_id == Empresa.id)
        .filter(UsuarioEmpresa.usuario_id == usuario_id, Empresa.activo == True)
        .order_by(Empresa.id)
        .all()
    )


def _modulos_de_empresa(db: Session, empresa_id: int):
    filas = (
        db.query(EmpresaModulo.modulo)
        .filter(EmpresaModulo.empresa_id == empresa_id, EmpresaModulo.activo == True)
        .all()
    )
    return [f[0] for f in filas]


def _token_response(user: Usuario, empresa: Empresa, empresas_disponibles, db: Session):
    token = create_access_token({
        "sub": str(user.id),
        "rol": user.rol,
        "empresa_id": empresa.id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": user.id,
            "username": user.username,
            "nombre_completo": user.nombre_completo,
            "rol": user.rol
        },
        "empresa_actual": {
            "id": empresa.id,
            "nombre": empresa.nombre,
            "color": empresa.color,
        },
        "empresas_disponibles": [
            {"id": e.id, "nombre": e.nombre, "color": e.color} for e in empresas_disponibles
        ],
        "modulos": _modulos_de_empresa(db, empresa.id),
    }


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(
        Usuario.username == form.username,
        Usuario.activo == True
    ).first()

    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    empresas = _empresas_del_usuario(db, user.id)
    if not empresas:
        raise HTTPException(
            status_code=403,
            detail="Este usuario no tiene acceso a ninguna empresa. Contacta al administrador."
        )

    user.ultimo_acceso = datetime.now()
    db.commit()

    # Por defecto entra a la primera empresa a la que tiene acceso.
    # Si tiene varias, el frontend muestra el selector con empresas_disponibles.
    return _token_response(user, empresas[0], empresas, db)


class CambiarEmpresaRequest(BaseModel):
    empresa_id: int


@router.post("/cambiar-empresa")
def cambiar_empresa(
    body: CambiarEmpresaRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    empresas = _empresas_del_usuario(db, current_user.id)
    empresa = next((e for e in empresas if e.id == body.empresa_id), None)
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esa empresa")
    return _token_response(current_user, empresa, empresas, db)


@router.get("/me")
def me(
    current_user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_empresa_actual),
    db: Session = Depends(get_db)
):
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return {
        "id": current_user.id,
        "username": current_user.username,
        "nombre_completo": current_user.nombre_completo,
        "rol": current_user.rol,
        "email": current_user.email,
        "empresa_actual": {"id": empresa.id, "nombre": empresa.nombre, "color": empresa.color} if empresa else None,
        "modulos": _modulos_de_empresa(db, empresa_id),
    }
