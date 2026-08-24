"""
Diagnostico: busca productos con MAS DE UNA fila en la tabla
'inventario' (normalmente deberia haber solo 1 por producto+almacen).
Si el fraccionamiento creo una fila nueva en un almacen distinto al
que usan las ventas normales, aqui se veria duplicado.
Solo LEE, no modifica nada.
"""
import argparse
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument("--pg", required=True)
args = parser.parse_args()

pg = psycopg2.connect(args.pg)
cur = pg.cursor()

print("=== Almacenes existentes ===")
cur.execute("SELECT id, empresa_id, nombre FROM almacenes ORDER BY id")
for r in cur.fetchall():
    print(f"  id={r[0]}  empresa_id={r[1]}  nombre={r[2]}")

print("\n=== Productos con MAS DE 1 fila en inventario (duplicados) ===")
cur.execute("""
    SELECT i.producto_id, p.nombre, COUNT(*) as filas,
           STRING_AGG(i.almacen_id::text || ':' || i.cantidad::text, ' | ') as detalle
    FROM inventario i
    JOIN productos p ON i.producto_id = p.id
    GROUP BY i.producto_id, p.nombre
    HAVING COUNT(*) > 1
""")
dupes = cur.fetchall()
if not dupes:
    print("  Ninguno encontrado.")
else:
    for d in dupes:
        print(f"  producto_id={d[0]} ({d[1]}): {d[2]} filas -> almacen:cantidad = {d[3]}")

pg.close()
