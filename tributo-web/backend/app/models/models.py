"""
Modelos SQLAlchemy — espejo exacto del esquema SAPOS SQLite
Migrado a PostgreSQL
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text,
    DateTime, ForeignKey, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    id                = Column(Integer, primary_key=True, index=True)
    username          = Column(String(50), unique=True, nullable=False, index=True)
    password_hash     = Column(String(255), nullable=False)
    nombre_completo   = Column(String(100), nullable=False)
    rol               = Column(String(20), nullable=False, default="CAJERO")
    email             = Column(String(100))
    pin               = Column(String(255))
    activo            = Column(Boolean, default=True)
    ultimo_acceso     = Column(DateTime)
    intentos_fallidos = Column(Integer, default=0)
    bloqueado_hasta   = Column(DateTime)
    creado_en         = Column(DateTime, server_default=func.now())
    actualizado_en    = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Almacen(Base):
    __tablename__ = "almacenes"
    id          = Column(Integer, primary_key=True)
    nombre      = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    direccion   = Column(Text)
    es_principal = Column(Boolean, default=False)
    activo      = Column(Boolean, default=True)
    creado_en   = Column(DateTime, server_default=func.now())


class Categoria(Base):
    __tablename__ = "categorias"
    id          = Column(Integer, primary_key=True)
    nombre      = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    color       = Column(String(20), default="#4A9EFF")
    icono       = Column(String(10), default="📦")
    activo      = Column(Boolean, default=True)
    creado_en   = Column(DateTime, server_default=func.now())
    productos   = relationship("Producto", back_populates="categoria")


class Proveedor(Base):
    __tablename__ = "proveedores"
    id               = Column(Integer, primary_key=True)
    nombre           = Column(String(150), nullable=False)
    rif_nit          = Column(String(30))
    contacto         = Column(String(100))
    telefono         = Column(String(30))
    email            = Column(String(100))
    direccion        = Column(Text)
    ciudad           = Column(String(80))
    pais             = Column(String(60), default="Venezuela")
    moneda_preferida = Column(String(5), default="USD")
    notas            = Column(Text)
    activo           = Column(Boolean, default=True)
    creado_en        = Column(DateTime, server_default=func.now())
    actualizado_en   = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Producto(Base):
    __tablename__ = "productos"
    id                    = Column(Integer, primary_key=True, index=True)
    codigo                = Column(String(50), unique=True)
    codigo_barras         = Column(String(50), unique=True)
    nombre                = Column(String(150), nullable=False, index=True)
    descripcion           = Column(Text)
    categoria_id          = Column(Integer, ForeignKey("categorias.id", ondelete="SET NULL"))
    proveedor_id          = Column(Integer, ForeignKey("proveedores.id", ondelete="SET NULL"))
    precio_costo_usd      = Column(Float, default=0)
    precio_venta_usd      = Column(Float, default=0)
    precio_mayoreo_usd    = Column(Float, default=0)
    aplica_iva            = Column(Boolean, default=True)
    porcentaje_iva        = Column(Float, default=16.0)
    tiene_inventario      = Column(Boolean, default=True)
    stock_minimo          = Column(Float, default=5)
    stock_critico         = Column(Float, default=2)
    tiene_variantes       = Column(Boolean, default=False)
    imagen_path           = Column(String(255))
    unidad                = Column(String(20), default="UND")
    activo                = Column(Boolean, default=True)
    destino_impresion     = Column(String(20), default="NINGUNO")
    tipo_producto         = Column(String(20), default="VENTA")
    tiene_presentacion_caja = Column(Boolean, default=False)
    unidades_por_caja     = Column(Integer, default=0)
    precio_caja_usd       = Column(Float, default=0)
    creado_en             = Column(DateTime, server_default=func.now())
    actualizado_en        = Column(DateTime, server_default=func.now(), onupdate=func.now())

    categoria  = relationship("Categoria", back_populates="productos")
    variantes  = relationship("ProductoVariante", back_populates="producto", cascade="all, delete-orphan")
    receta     = relationship("Receta", back_populates="producto", uselist=False)


class ProductoVariante(Base):
    __tablename__ = "producto_variantes"
    id              = Column(Integer, primary_key=True)
    producto_id     = Column(Integer, ForeignKey("productos.id", ondelete="CASCADE"), nullable=False)
    tipo_variante   = Column(String(50), nullable=False)
    valor_variante  = Column(String(100), nullable=False)
    codigo_barras   = Column(String(50), unique=True)
    codigo_sku      = Column(String(50))
    precio_extra_usd = Column(Float, default=0)
    precio_usd      = Column(Float, default=0)
    receta_id       = Column(Integer, ForeignKey("recetas.id"))
    activo          = Column(Boolean, default=True)

    producto = relationship("Producto", back_populates="variantes")
    __table_args__ = (UniqueConstraint("producto_id", "tipo_variante", "valor_variante"),)


class Receta(Base):
    __tablename__ = "recetas"
    id                  = Column(Integer, primary_key=True)
    producto_id         = Column(Integer, ForeignKey("productos.id"), nullable=False, unique=True)
    rendimiento         = Column(Float, default=1)
    unidad_rendimiento  = Column(String(20), default="UND")
    notas               = Column(Text)
    activa              = Column(Boolean, default=True)
    creado_en           = Column(DateTime, server_default=func.now())
    actualizado_en      = Column(DateTime, server_default=func.now(), onupdate=func.now())

    producto    = relationship("Producto", back_populates="receta")
    ingredientes = relationship("DetalleReceta", back_populates="receta", cascade="all, delete-orphan")


class DetalleReceta(Base):
    __tablename__ = "detalle_recetas"
    id             = Column(Integer, primary_key=True)
    receta_id      = Column(Integer, ForeignKey("recetas.id", ondelete="CASCADE"), nullable=False)
    ingrediente_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad       = Column(Float, default=1)
    unidad         = Column(String(20), default="UND")
    opcional       = Column(Boolean, default=False)
    notas          = Column(Text)

    receta      = relationship("Receta", back_populates="ingredientes")
    ingrediente = relationship("Producto", foreign_keys=[ingrediente_id])


class Cliente(Base):
    __tablename__ = "clientes"
    id                 = Column(Integer, primary_key=True, index=True)
    nombre             = Column(String(150), nullable=False)
    rif_cedula         = Column(String(30), unique=True)
    telefono           = Column(String(30))
    email              = Column(String(100))
    direccion          = Column(Text)
    ciudad             = Column(String(80))
    tipo               = Column(String(20), default="NATURAL")
    credito_limite_usd = Column(Float, default=0)
    credito_usado_usd  = Column(Float, default=0)
    descuento_fijo_pct = Column(Float, default=0)
    moneda_preferida   = Column(String(5), default="USD")
    notas              = Column(Text)
    activo             = Column(Boolean, default=True)
    creado_en          = Column(DateTime, server_default=func.now())
    actualizado_en     = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Venta(Base):
    __tablename__ = "ventas"
    id                  = Column(Integer, primary_key=True, index=True)
    numero_venta        = Column(String(50), unique=True, nullable=False, index=True)
    tipo                = Column(String(20), default="RAPIDA")
    estado              = Column(String(20), default="ABIERTA")
    cliente_id          = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"))
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    mesa_id             = Column(Integer, ForeignKey("mesas.id", ondelete="SET NULL"))
    almacen_id          = Column(Integer, ForeignKey("almacenes.id"), nullable=False)
    delivery_direccion  = Column(Text)
    delivery_notas      = Column(Text)
    moneda_display      = Column(String(5), default="USD")
    subtotal_usd        = Column(Float, default=0)
    descuento_pct       = Column(Float, default=0)
    descuento_monto_usd = Column(Float, default=0)
    iva_pct             = Column(Float, default=0)
    iva_monto_usd       = Column(Float, default=0)
    total_usd           = Column(Float, default=0)
    total_pagado_usd    = Column(Float, default=0)
    cambio_usd          = Column(Float, default=0)
    tasa_ves            = Column(Float)
    tasa_cop            = Column(Float)
    notas               = Column(Text)
    anulada             = Column(Boolean, default=False)
    anulada_por         = Column(Integer, ForeignKey("usuarios.id"))
    motivo_anulacion    = Column(Text)
    anulada_en          = Column(DateTime)
    fecha_venta         = Column(DateTime, server_default=func.now())
    cerrada_en          = Column(DateTime)
    creado_en           = Column(DateTime, server_default=func.now())

    detalles = relationship("DetalleVenta", back_populates="venta", cascade="all, delete-orphan")
    pagos    = relationship("PagoVenta", back_populates="venta", cascade="all, delete-orphan")


class DetalleVenta(Base):
    __tablename__ = "detalle_ventas"
    id                  = Column(Integer, primary_key=True)
    venta_id            = Column(Integer, ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False)
    producto_id         = Column(Integer, ForeignKey("productos.id"), nullable=False)
    variante_id         = Column(Integer, ForeignKey("producto_variantes.id"))
    cantidad            = Column(Float, nullable=False)
    unidad              = Column(String(20), default="UND")
    precio_unitario_usd = Column(Float, nullable=False)
    costo_unitario_usd  = Column(Float, default=0)
    descuento_pct       = Column(Float, default=0)
    descuento_monto_usd = Column(Float, default=0)
    iva_pct             = Column(Float, default=0)
    iva_monto_usd       = Column(Float, default=0)
    subtotal_usd        = Column(Float, nullable=False)
    total_usd           = Column(Float, nullable=False)
    moneda_display      = Column(String(5), default="USD")
    precio_display      = Column(Float, nullable=False)
    tasa_usada          = Column(Float, default=1.0)
    nombre_producto     = Column(String(150), nullable=False)
    nombre_variante     = Column(String(100))
    extras_json         = Column(Text)
    extras_precio_usd   = Column(Float, default=0)
    devuelto            = Column(Boolean, default=False)
    cantidad_devuelta   = Column(Float, default=0)
    creado_en           = Column(DateTime, server_default=func.now())

    venta    = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto")


class PagoVenta(Base):
    __tablename__ = "pagos_venta"
    id          = Column(Integer, primary_key=True)
    venta_id    = Column(Integer, ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False)
    metodo_pago = Column(String(50), nullable=False)
    moneda      = Column(String(5), nullable=False)
    monto       = Column(Float, nullable=False)
    monto_usd   = Column(Float, nullable=False)
    tasa_usada  = Column(Float, default=1.0)
    referencia  = Column(String(100))
    notas       = Column(Text)
    creado_en   = Column(DateTime, server_default=func.now())

    venta = relationship("Venta", back_populates="pagos")


class TurnoCaja(Base):
    __tablename__ = "turnos_caja"
    id                  = Column(Integer, primary_key=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    almacen_id          = Column(Integer, ForeignKey("almacenes.id"), nullable=False)
    fondo_inicial_usd   = Column(Float, default=0)
    fondo_inicial_ves   = Column(Float, default=0)
    fondo_inicial_cop   = Column(Float, default=0)
    abierto_en          = Column(DateTime, server_default=func.now())
    total_ventas_usd    = Column(Float)
    efectivo_real_usd   = Column(Float)
    efectivo_real_ves   = Column(Float)
    efectivo_real_cop   = Column(Float)
    diferencia_usd      = Column(Float)
    cerrado_en          = Column(DateTime)
    notas_cierre        = Column(Text)
    estado              = Column(String(10), default="ABIERTO")


class EgresoCaja(Base):
    __tablename__ = "egresos_caja"
    id           = Column(Integer, primary_key=True)
    turno_id     = Column(Integer, ForeignKey("turnos_caja.id"))
    usuario_id   = Column(Integer, ForeignKey("usuarios.id"))
    categoria    = Column(String(30), default="GASTO")
    concepto     = Column(String(200), nullable=False)
    monto_usd    = Column(Float, default=0)
    moneda       = Column(String(5), default="USD")
    monto_moneda = Column(Float, default=0)
    metodo_pago  = Column(String(50))
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"))
    referencia   = Column(String(100))
    fecha        = Column(DateTime, server_default=func.now())
    notas        = Column(Text)


class IngresoCaja(Base):
    __tablename__ = "ingresos_caja"
    id           = Column(Integer, primary_key=True)
    turno_id     = Column(Integer, ForeignKey("turnos_caja.id"))
    usuario_id   = Column(Integer, ForeignKey("usuarios.id"))
    categoria    = Column(String(30), default="OTRO")
    concepto     = Column(String(200), nullable=False)
    monto_usd    = Column(Float, default=0)
    moneda       = Column(String(5), default="USD")
    monto_moneda = Column(Float, default=0)
    referencia   = Column(String(100))
    fecha        = Column(DateTime, server_default=func.now())
    notas        = Column(Text)


class Inventario(Base):
    __tablename__ = "inventario"
    id          = Column(Integer, primary_key=True)
    producto_id = Column(Integer, ForeignKey("productos.id", ondelete="CASCADE"), nullable=False)
    variante_id = Column(Integer, ForeignKey("producto_variantes.id", ondelete="CASCADE"))
    almacen_id  = Column(Integer, ForeignKey("almacenes.id", ondelete="CASCADE"), nullable=False)
    cantidad    = Column(Float, default=0)
    ultima_entrada = Column(DateTime)
    ultima_salida  = Column(DateTime)
    __table_args__ = (UniqueConstraint("producto_id", "variante_id", "almacen_id"),)


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"
    id                = Column(Integer, primary_key=True, index=True)
    producto_id       = Column(Integer, ForeignKey("productos.id"), nullable=False)
    variante_id       = Column(Integer, ForeignKey("producto_variantes.id"))
    almacen_id        = Column(Integer, ForeignKey("almacenes.id"), nullable=False)
    tipo              = Column(String(20), nullable=False)
    cantidad          = Column(Float, nullable=False)
    cantidad_antes    = Column(Float, nullable=False)
    cantidad_despues  = Column(Float, nullable=False)
    referencia_tipo   = Column(String(50))
    referencia_id     = Column(Integer)
    costo_usd         = Column(Float)
    costo_total_usd   = Column(Float)
    cantidad_consumida = Column(Float, default=0)
    usuario_id        = Column(Integer, ForeignKey("usuarios.id"))
    notas             = Column(Text)
    creado_en         = Column(DateTime, server_default=func.now())


class Mesa(Base):
    __tablename__ = "mesas"
    id             = Column(Integer, primary_key=True)
    numero         = Column(Integer, unique=True, nullable=False)
    nombre         = Column(String(50))
    capacidad      = Column(Integer, default=4)
    estado         = Column(String(20), default="LIBRE")
    zona           = Column(String(50), default="Principal")
    activo         = Column(Boolean, default=True)
    venta_activa_id = Column(Integer)
    creado_en      = Column(DateTime, server_default=func.now())


class Compra(Base):
    __tablename__ = "compras"
    id            = Column(Integer, primary_key=True)
    numero_compra = Column(String(50), unique=True, nullable=False)
    proveedor_id  = Column(Integer, ForeignKey("proveedores.id"))
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    almacen_id    = Column(Integer, ForeignKey("almacenes.id"), nullable=False)
    estado        = Column(String(20), default="PENDIENTE")
    moneda        = Column(String(5), default="USD")
    subtotal_usd  = Column(Float, default=0)
    iva_usd       = Column(Float, default=0)
    total_usd     = Column(Float, default=0)
    fecha_compra  = Column(DateTime, server_default=func.now())
    fecha_entrega = Column(DateTime)
    notas         = Column(Text)

    detalles = relationship("DetalleCompra", back_populates="compra", cascade="all, delete-orphan")


class DetalleCompra(Base):
    __tablename__ = "detalle_compras"
    id                  = Column(Integer, primary_key=True)
    compra_id           = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"), nullable=False)
    producto_id         = Column(Integer, ForeignKey("productos.id"), nullable=False)
    variante_id         = Column(Integer, ForeignKey("producto_variantes.id"))
    cantidad            = Column(Float, nullable=False)
    cantidad_recibida   = Column(Float, default=0)
    precio_unitario_usd = Column(Float, nullable=False)
    subtotal_usd        = Column(Float, nullable=False)

    compra   = relationship("Compra", back_populates="detalles")
    producto = relationship("Producto")


class TasaCambio(Base):
    __tablename__ = "tasas_de_cambio"
    id              = Column(Integer, primary_key=True)
    moneda_origen   = Column(String(5), nullable=False)
    moneda_destino  = Column(String(5), nullable=False)
    tasa            = Column(Float, nullable=False)
    fuente          = Column(String(20), default="MANUAL")
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"))
    notas           = Column(Text)
    vigente         = Column(Boolean, default=True)
    creado_en       = Column(DateTime, server_default=func.now())


class Merma(Base):
    __tablename__ = "mermas"
    id          = Column(Integer, primary_key=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad    = Column(Float, nullable=False)
    motivo      = Column(String(100), default="Otro")
    costo_usd   = Column(Float, default=0)
    usuario_id  = Column(Integer, ForeignKey("usuarios.id"))
    notas       = Column(Text)
    fecha       = Column(DateTime, server_default=func.now())


class VarianteIngredientes(Base):
    __tablename__ = "variante_ingredientes"
    id             = Column(Integer, primary_key=True)
    variante_id    = Column(Integer, ForeignKey("producto_variantes.id", ondelete="CASCADE"), nullable=False)
    ingrediente_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad       = Column(Float, default=1)


class MetodoPago(Base):
    __tablename__ = "metodos_pago"
    id        = Column(Integer, primary_key=True)
    codigo    = Column(String(50), unique=True, nullable=False)
    nombre    = Column(String(100), nullable=False)
    moneda    = Column(String(5), default="USD")
    activo    = Column(Boolean, default=True)
    es_base   = Column(Boolean, default=False)
    creado_en = Column(DateTime, server_default=func.now())


class Configuracion(Base):
    __tablename__ = "configuracion"
    clave       = Column(String(100), primary_key=True)
    valor       = Column(Text, nullable=False)
    tipo        = Column(String(20), default="texto")
    descripcion = Column(Text)
    actualizado = Column(DateTime, server_default=func.now(), onupdate=func.now())
