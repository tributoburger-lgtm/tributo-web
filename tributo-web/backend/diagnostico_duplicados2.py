"""
Version corregida: solo cuenta como 'duplicado' cuando el MISMO
producto + almacen + variante (o sin variante) aparece mas de una
vez — que es exactamente lo que consulta el motor de stock
(_ajustar_stock). Las variantes distintas de un mismo producto NO
cuentan como duplicado, son correctas.
Solo LEE, no modifica nada.
"""
import argparse
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument("--pg", required=True)
args = parser.parse_args()

pg = psycopg2.connect(args.pg)
cur = pg.cursor()

print("=== Duplicados REALES (mismo producto+almacen, variante_id IS NULL) ===")
cur.execute("""
    SELECT i.producto_id, p.nombre, COUNT(*) as filas,
           STRING_AGG(i.id::text || ':' || i.cantidad::text, ' | ') as detalle
    FROM inventario i
    JOIN productos p ON i.producto_id = p.id
    WHERE i.variante_id IS NULL
    GROUP BY i.producto_id, p.nombre
    HAVING COUNT(*) > 1
""")
dupes = cur.fetchall()
if not dupes:
    print("  Ninguno encontrado -- no hay duplicados reales de stock base.")
else:
    for d in dupes:
        print(f"  producto_id={d[0]} ({d[1]}): {d[2]} filas -> id:cantidad = {d[3]}")

print("\n=== Movimientos de tipo FRACCIONAMIENTO recientes ===")
cur.execute("""
    SELECT m.id, m.producto_id, p.nombre, m.tipo, m.cantidad,
           m.cantidad_antes, m.cantidad_despues, m.referencia_tipo, m.creado_en
    FROM movimientos_inventario m
    JOIN productos p ON m.producto_id = p.id
    WHERE m.referencia_tipo = 'FRACCIONAMIENTO'
    ORDER BY m.creado_en DESC
    LIMIT 10
""")
movs = cur.fetchall()
if not movs:
    print("  No se encontro ningun movimiento de fraccionamiento todavia.")
else:
    for m in movs:
        print(f"  #{m[0]} {m[2]}: {m[3]} {m[4]}  ({m[5]} -> {m[6]})  {m[8]}")

pg.close()
