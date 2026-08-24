"""
Tributo Web — Backend FastAPI
Sistema POS multiusuario para Tributo Smash Burger
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api.routes import (
    auth, productos, ventas, inventario,
    caja, reportes, compras, clientes,
    restaurant, configuracion, mermas, recetas
)

app = FastAPI(
    title="Tributo POS API",
    description="API REST para el sistema de punto de venta de Tributo Smash Burger",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción: solo tu dominio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,          prefix="/api/auth",          tags=["Auth"])
app.include_router(productos.router,     prefix="/api/productos",     tags=["Productos"])
app.include_router(ventas.router,        prefix="/api/ventas",        tags=["Ventas"])
app.include_router(inventario.router,    prefix="/api/inventario",    tags=["Inventario"])
app.include_router(caja.router,          prefix="/api/caja",          tags=["Caja"])
app.include_router(reportes.router,      prefix="/api/reportes",      tags=["Reportes"])
app.include_router(compras.router,       prefix="/api/compras",       tags=["Compras"])
app.include_router(clientes.router,      prefix="/api/clientes",      tags=["Clientes"])
app.include_router(restaurant.router,    prefix="/api/restaurant",    tags=["Restaurant"])
app.include_router(configuracion.router, prefix="/api/config",        tags=["Configuracion"])
app.include_router(mermas.router,        prefix="/api/mermas",        tags=["Mermas"])
app.include_router(recetas.router,       prefix="/api/recetas",       tags=["Recetas"])

@app.get("/")
def root():
    return {"status": "ok", "sistema": "Tributo POS", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
