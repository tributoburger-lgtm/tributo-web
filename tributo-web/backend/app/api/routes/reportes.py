from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.models import Venta, DetalleVenta, EgresoCaja, IngresoCaja, Merma

router = APIRouter()

@router.get("/estado-resultados")
def estado_resultados(desde: str, hasta: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    ventas = db.query(func.coalesce(func.sum(Venta.total_usd), 0)).filter(
        Venta.anulada == False,
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).scalar() or 0

    costos = db.query(func.coalesce(
        func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_usd), 0
    )).join(Venta).filter(
        Venta.anulada == False,
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).scalar() or 0

    gastos = db.query(func.coalesce(func.sum(EgresoCaja.monto_usd), 0)).filter(
        EgresoCaja.categoria.in_(["GASTO", "PROVEEDOR"]),
        func.date(EgresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0

    mermas = db.query(func.coalesce(func.sum(Merma.costo_usd), 0)).filter(
        func.date(Merma.fecha).between(desde, hasta)
    ).scalar() or 0

    otros_ing = db.query(func.coalesce(func.sum(IngresoCaja.monto_usd), 0)).filter(
        IngresoCaja.categoria.in_(["OTRO", "OTRO_INGRESO"]),
        func.date(IngresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0

    dividendos = db.query(func.coalesce(func.sum(EgresoCaja.monto_usd), 0)).filter(
        EgresoCaja.categoria == "DIVIDENDO",
        func.date(EgresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0

    adelanto_div = db.query(func.coalesce(func.sum(EgresoCaja.monto_usd), 0)).filter(
        EgresoCaja.categoria == "ADELANTO_DIVIDENDO",
        func.date(EgresoCaja.fecha).between(desde, hasta)
    ).scalar() or 0

    ub = ventas - costos
    un = ub - gastos - mermas
    uai = un + otros_ing
    ur = uai - dividendos - adelanto_div

    return {
        "desde": desde,
        "hasta": hasta,
        "ventas": ventas,
        "costos": costos,
        "utilidad_bruta": ub,
        "gastos": gastos,
        "mermas": mermas,
        "utilidad_neta": un,
        "otros_ingresos": otros_ing,
        "uai": uai,
        "dividendos": dividendos,
        "adelanto_dividendos": adelanto_div,
        "utilidad_retenida": ur,
        "margen_bruto": round(ub/ventas*100, 1) if ventas else 0,
        "margen_neto": round(un/ventas*100, 1) if ventas else 0,
    }

@router.get("/ventas-por-dia")
def ventas_por_dia(desde: str, hasta: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(
        func.date(Venta.fecha_venta).label("dia"),
        func.count(Venta.id).label("transacciones"),
        func.sum(Venta.total_usd).label("total")
    ).filter(
        Venta.anulada == False,
        func.date(Venta.fecha_venta).between(desde, hasta)
    ).group_by(func.date(Venta.fecha_venta)).order_by("dia").all()
    return [{"dia": r.dia, "transacciones": r.transacciones, "total": float(r.total or 0)} for r in rows]
