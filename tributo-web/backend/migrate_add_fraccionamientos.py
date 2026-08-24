"""
Migracion incremental: crea la tabla 'fraccionamientos_web' (convertir
presentaciones grandes en unidades chicas, con costo FIFO transferido).

NOTA: se llama 'fraccionamientos_web' y no 'fraccionamientos' porque
esa tabla ya existia con datos migrados del Desktop (estructura
distinta) — esta es la version nueva para el sistema web, separada.

Idempotente.

Uso:
  python migrate_add_fraccionamientos.py --pg postgresql://user:pass@host/db
"""
import argparse
import psycopg2


def migrate(pg_url: str):
    pg = psycopg2.connect(pg_url)
    cur = pg.cursor()
    try:
        print("=== Tabla fraccionamientos_web ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fraccionamientos_web (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL REFERENCES empresas(id),
                producto_origen_id INTEGER NOT NULL REFERENCES productos(id),
                cantidad_origen FLOAT NOT NULL,
                producto_destino_id INTEGER NOT NULL REFERENCES productos(id),
                cantidad_destino FLOAT NOT NULL,
                costo_total_usd FLOAT DEFAULT 0,
                usuario_id INTEGER REFERENCES usuarios(id),
                almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
                notas TEXT,
                fecha TIMESTAMP DEFAULT NOW(),
                revertido BOOLEAN DEFAULT FALSE
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_frac_web_empresa ON fraccionamientos_web(empresa_id)")
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
