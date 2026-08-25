"""
Migracion incremental: crea las tablas 'extras' y 'producto_extras'
para el sistema de adicionales (ej: "Extra Tocineta +$1.50").
Idempotente.

Uso:
  python migrate_add_extras.py --pg postgresql://user:pass@host/db
"""
import argparse
import psycopg2


def migrate(pg_url: str):
    pg = psycopg2.connect(pg_url)
    cur = pg.cursor()
    try:
        print("=== Tabla extras ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS extras (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL REFERENCES empresas(id),
                nombre VARCHAR(100) NOT NULL,
                precio_usd FLOAT DEFAULT 0,
                ingrediente_id INTEGER REFERENCES productos(id),
                activo BOOLEAN DEFAULT TRUE
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_extras_empresa ON extras(empresa_id)")
        pg.commit()
        print("  Tabla creada (o ya existia)")

        print("=== Tabla producto_extras ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS producto_extras (
                id SERIAL PRIMARY KEY,
                producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                extra_id INTEGER NOT NULL REFERENCES extras(id) ON DELETE CASCADE,
                UNIQUE(producto_id, extra_id)
            )
        """)
        pg.commit()
        print("  Tabla creada (o ya existia)")
        print("\n✅ Listo.")
    except Exception as e:
        pg.rollback()
        print(f"\n❌ ERROR: {e}")
        raise
    finally:
        cur.close()
        pg.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg", required=True)
    args = parser.parse_args()
    migrate(args.pg)
