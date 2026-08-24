from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_empresa_actual
from app.models.models import Venta, DetalleVenta, EgresoCaja, IngresoCaja, Merma

router = APIRouter()

# Mismas 5 categorias definidas en SAPOS Desktop (cash_register.py / reports.py)
CATS_COSTO_IND_VAR = "COSTO_IND_VARIABLE"
CATS_COSTO_IND_FIJO = "COSTO_IND_FIJO"
CATS_GASTO_ADMIN = "GASTO_ADMIN"
CATS_GASTO_VENTAS = "GASTO_VENTAS"
CATS_GASTO_NO_RECUR = "GASTO_NO_RECURRENTE"


def _suma_categoria(db, empresa_id, categoria, desde, hasta):
    return db.query(func.coalesce(func.sum(EgresoCaja.monto_usd), 0)).filter(
        EgresoCaja.empresa_id == empresa_id,
        EgresoCaja.categoria == categoria,
        func.date(EgresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0


def _detalle_categoria(db, empresa_id, categoria, desde, hasta):
    rows = db.query(EgresoCaja).filter(
        EgresoCaja.empresa_id == empresa_id,
        EgresoCaja.categoria == categoria,
        func.date(EgresoCaja.fecha).between(desde, hasta)
    ).order_by(EgresoCaja.fecha.desc()).all()
    return [{"concepto": r.concepto, "monto_usd": r.monto_usd, "fecha": r.fecha} for r in rows]


@router.get("/estado-resultados")
def estado_resultados(
    desde: str, hasta: str, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    ventas = db.query(func.coalesce(func.sum(Venta.total_usd), 0)).filter(
        Venta.empresa_id == empresa_id,
        Venta.anulada == False,
        Venta.estado == "CERRADA",
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).scalar() or 0

    costo_directo = db.query(func.coalesce(
        func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_usd), 0
    )).join(Venta).filter(
        Venta.empresa_id == empresa_id,
        Venta.anulada == False,
        Venta.estado == "CERRADA",
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).scalar() or 0

    # --- Costos indirectos (afectan Utilidad Bruta, igual que en Desktop) ---
    costo_ind_variable = _suma_categoria(db, empresa_id, CATS_COSTO_IND_VAR, desde, hasta)
    costo_ind_fijo = _suma_categoria(db, empresa_id, CATS_COSTO_IND_FIJO, desde, hasta)

    # Mermas se suman al Costo Indirecto Variable, igual que en Desktop
    mermas_monto = db.query(func.coalesce(func.sum(Merma.costo_usd), 0)).filter(
        Merma.empresa_id == empresa_id,
        func.date(Merma.fecha).between(desde, hasta)
    ).scalar() or 0
    costo_ind_variable += mermas_monto

    costo_indirecto_total = costo_ind_variable + costo_ind_fijo
    ub = ventas - costo_directo - costo_indirecto_total
    mb = round(ub / ventas * 100, 1) if ventas else 0

    # --- Gastos operativos (afectan Utilidad Operativa, DESPUES de UB) ---
    gastos_admin = _suma_categoria(db, empresa_id, CATS_GASTO_ADMIN, desde, hasta)
    gastos_ventas = _suma_categoria(db, empresa_id, CATS_GASTO_VENTAS, desde, hasta)
    gastos_no_recurrente = _suma_categoria(db, empresa_id, CATS_GASTO_NO_RECUR, desde, hasta)
    gasto_operativo_total = gastos_admin + gastos_ventas + gastos_no_recurrente
    uop = ub - gasto_operativo_total
    mo = round(uop / ventas * 100, 1) if ventas else 0

    otros_ing = db.query(func.coalesce(func.sum(IngresoCaja.monto_usd), 0)).filter(
        IngresoCaja.empresa_id == empresa_id,
        IngresoCaja.categoria.in_(["OTRO", "OTRO_INGRESO", "APORTE_SOCIO", "PRESTAMO"]),
        func.date(IngresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0

    dividendos = _suma_categoria(db, empresa_id, "DIVIDENDO", desde, hasta)
    adelanto_div = _suma_categoria(db, empresa_id, "ADELANTO_DIVIDENDO", desde, hasta)

    uai = uop + otros_ing
    ur = uai - dividendos - adelanto_div

    return {
        "desde": desde, "hasta": hasta,
        "ventas": ventas,
        "costo_directo": costo_directo,
        "costo_blocks": [
            {"label": "Costos Indirectos Variables", "total": costo_ind_variable,
             "det": _detalle_categoria(db, empresa_id, CATS_COSTO_IND_VAR, desde, hasta)},
            {"label": "Costos Indirectos Fijos", "total": costo_ind_fijo,
             "det": _detalle_categoria(db, empresa_id, CATS_COSTO_IND_FIJO, desde, hasta)},
        ],
        "utilidad_bruta": ub,
        "margen_bruto": mb,
        "gasto_blocks": [
            {"label": "Gastos Administrativos", "total": gastos_admin,
             "det": _detalle_categoria(db, empresa_id, CATS_GASTO_ADMIN, desde, hasta)},
            {"label": "Gastos de Ventas", "total": gastos_ventas,
             "det": _detalle_categoria(db, empresa_id, CATS_GASTO_VENTAS, desde, hasta)},
            {"label": "Gastos No Recurrentes", "total": gastos_no_recurrente,
             "det": _detalle_categoria(db, empresa_id, CATS_GASTO_NO_RECUR, desde, hasta)},
        ],
        "utilidad_operativa": uop,
        "margen_operativo": mo,
        "otros_ingresos": otros_ing,
        "uai": uai,
        "dividendos": dividendos,
        "adelanto_dividendos": adelanto_div,
        "utilidad_retenida": ur,
    }


@router.get("/ventas-por-dia")
def ventas_por_dia(
    desde: str, hasta: str, db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_actual),
    _=Depends(get_current_user)
):
    rows = db.query(
        func.date(Venta.fecha_venta).label("dia"),
        func.count(Venta.id).label("transacciones"),
        func.sum(Venta.total_usd).label("total")
    ).filter(
        Venta.empresa_id == empresa_id,
        Venta.anulada == False,
        Venta.estado == "CERRADA",
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).group_by(func.date(Venta.fecha_venta)).order_by("dia").all()
    return [{"dia": str(r.dia), "transacciones": r.transacciones, "total": float(r.total or 0)} for r in rows]
