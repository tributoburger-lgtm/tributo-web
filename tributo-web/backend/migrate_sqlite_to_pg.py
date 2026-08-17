"""
Script de migración: SQLite (SAPOS) → PostgreSQL (Tributo Web)
Ejecutar UNA SOLA VEZ para migrar todos los datos existentes.

Uso:
  python migrate_sqlite_to_pg.py --sqlite C:/SAPOS/data/sapos.db --pg postgresql://user:pass@host/tributo
"""

import argparse
import sqlite3
import psycopg2
from psycopg2.extras import execute_values

TABLAS = [
    "almacenes", "categorias", "proveedores", "usuarios",
    "productos", "producto_variantes", "recetas", "detalle_recetas",
    "variante_ingredientes", "clientes", "mesas", "metodos_pago",
    "tasas_de_cambio", "configuracion", "turnos_caja",
    "compras", "detalle_compras", "ventas", "detalle_ventas",
    "pagos_venta", "inventario", "movimientos_inventario",
    "ingresos_caja", "egresos_caja", "mermas",
    "comandas", "detalle_comandas", "pedidos_llevar", "detalle_pedidos_llevar",
    "fraccionamientos", "saldo_inicial_cuentas",
]

def migrate(sqlite_path: str, pg_url: str):
    sq = sqlite3.connect(sqlite_path)
    sq.row_factory = sqlite3.Row
    pg = psycopg2.connect(pg_url)
    pg_cur = pg.cursor()

    for tabla in TABLAS:
        print(f"Migrando {tabla}...", end=" ")
        try:
            rows = sq.execute(f"SELECT * FROM {tabla}").fetchall()
            if not rows:
                print("vacía")
                continue

            cols = rows[0].keys()
            col_str = ", ".join(f'"{c}"' for c in cols)
            vals = [tuple(row) for row in rows]

            # Truncate antes de insertar
            pg_cur.execute(f'TRUNCATE TABLE "{tabla}" RESTART IDENTITY CASCADE')
            execute_values(
                pg_cur,
                f'INSERT INTO "{tabla}" ({col_str}) VALUES %s ON CONFLICT DO NOTHING',
                vals
            )
            pg.commit()
            print(f"{len(rows)} filas ✓")
        except Exception as e:
            pg.rollback()
            print(f"ERROR: {e}")

    sq.close()
    pg.close()
    print("\n✅ Migración completada.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", required=True)
    parser.add_argument("--pg", required=True)
    args = parser.parse_args()
    migrate(args.sqlite, args.pg)
