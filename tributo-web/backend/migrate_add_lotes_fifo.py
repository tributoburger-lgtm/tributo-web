"""
Migracion incremental: agrega la tabla lotes_inventario (FIFO real) y le
da un "lote inicial" a todo el stock que ya existe hoy, usando el
precio_costo_usd actual de cada producto como costo de ese lote.

Es seguro correrlo mas de una vez (idempotente) — si un producto ya
tiene lotes, no le crea uno nuevo de nuevo.

Uso:
  python migrate_add_lotes_fifo.py --pg postgresql://user:pass@host/db
"""
import argparse
import psycopg2


def migrate(pg_url: str):
    pg = psycopg2.connect(pg_url)
    pg.autocommit = False
    cur = pg.cursor()

    try:
        print("=== 1. Tabla lotes_inventario ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lotes_inventario (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL REFERENCES empresas(id),
                producto_id INTEGER NOT NULL REFERENCES productos(id),
                almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
                cantidad_inicial FLOAT NOT NULL,
                cantidad_disponible FLOAT NOT NULL,
                costo_unitario_usd FLOAT NOT NULL,
                fecha_entrada TIMESTAMP DEFAULT NOW(),
                referencia_tipo VARCHAR(30),
                referencia_id INTEGER
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lotes_producto ON lotes_inventario(producto_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lotes_empresa ON lotes_inventario(empresa_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lotes_fecha ON lotes_inventario(fecha_entrada)")
        pg.commit()
        print("  Tabla creada (o ya existia)")

        print("\n=== 2. Lote inicial para el stock que ya existe ===")
        # Productos con stock > 0 que TODAVIA no tienen ningun lote
        cur.execute("""
            SELECT i.producto_id, i.almacen_id, i.cantidad,
                   p.empresa_id, p.precio_costo_usd
            FROM inventario i
            JOIN productos p ON i.producto_id = p.id
            WHERE i.cantidad > 0
              AND NOT EXISTS (
                  SELECT 1 FROM lotes_inventario l WHERE l.producto_id = i.producto_id
              )
        """)
        rows = cur.fetchall()
        for producto_id, almacen_id, cantidad, empresa_id, costo in rows:
            cur.execute("""
                INSERT INTO lotes_inventario
                    (empresa_id, producto_id, almacen_id, cantidad_inicial,
                     cantidad_disponible, costo_unitario_usd, referencia_tipo)
                VALUES (%s, %s, %s, %s, %s, %s, 'SALDO_INICIAL')
            """, (empresa_id, producto_id, almacen_id, cantidad, cantidad, costo or 0))
        pg.commit()
        print(f"  {len(rows)} producto(s) recibieron su lote inicial")

        print("\n✅ Migracion completada exitosamente.")

    except Exception as e:
        pg.rollback()
        print(f"\n❌ ERROR, se revirtio todo: {e}")
        raise
    finally:
        cur.close()
        pg.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg", required=True, help="URL de conexion a Postgres de Railway")
    args = parser.parse_args()
    migrate(args.pg)
