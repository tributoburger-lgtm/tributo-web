"""
Migracion incremental chiquita: activa el modulo VENTAS (nueva pantalla
de Historial de Ventas) para todas las empresas que ya existen.
Idempotente — si ya lo tienen activo, no hace nada.

Uso:
  python migrate_add_modulo_ventas.py --pg postgresql://user:pass@host/db
"""
import argparse
import psycopg2


def migrate(pg_url: str):
    pg = psycopg2.connect(pg_url)
    cur = pg.cursor()
    try:
        cur.execute("SELECT id, nombre FROM empresas")
        empresas = cur.fetchall()
        for eid, nombre in empresas:
            cur.execute("""
                INSERT INTO empresa_modulos (empresa_id, modulo, activo)
                VALUES (%s, 'VENTAS', TRUE)
                ON CONFLICT (empresa_id, modulo) DO UPDATE SET activo = TRUE
            """, (eid,))
            print(f"  VENTAS activado para '{nombre}'")
        pg.commit()
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
