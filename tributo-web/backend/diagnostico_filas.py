"""
Ve el estado EXACTO, fila por fila (sin agrupar), del inventario de
los productos involucrados en los fraccionamientos de prueba.
Solo LEE, no modifica nada.
"""
import argparse
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument("--pg", required=True)
args = parser.parse_args()

pg = psycopg2.connect(args.pg)
cur = pg.cursor()

nombres = ["COCA COLA 1LTS", "COCA COLA 2LTS", "COCA COLA P355", "Vaso Refresco"]

for nombre in nombres:
    cur.execute("SELECT id FROM productos WHERE nombre = %s", (nombre,))
    row = cur.fetchone()
    if not row:
        print(f"{nombre}: producto no encontrado")
        continue
    producto_id = row[0]
    cur.execute("""
        SELECT id, almacen_id, variante_id, cantidad, ultima_entrada, ultima_salida
        FROM inventario WHERE producto_id = %s
    """, (producto_id,))
    filas = cur.fetchall()
    print(f"\n{nombre} (producto_id={producto_id}): {len(filas)} fila(s) en inventario")
    for f in filas:
        print(f"  inventario.id={f[0]}  almacen_id={f[1]}  variante_id={f[2]}  cantidad={f[3]}")

pg.close()
