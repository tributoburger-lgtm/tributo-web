"""
Diagnostico: revisa que columnas tiene la tabla 'fraccionamientos'
y cuantas filas tiene, para saber si es segura de borrar y recrear.
Solo LEE, no modifica nada.
"""
import argparse
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument("--pg", required=True)
args = parser.parse_args()

pg = psycopg2.connect(args.pg)
cur = pg.cursor()

cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='fraccionamientos'
    ORDER BY ordinal_position
""")
cols = cur.fetchall()
print("Columnas actuales de 'fraccionamientos':")
for c in cols:
    print(f"  - {c[0]} ({c[1]})")

cur.execute("SELECT COUNT(*) FROM fraccionamientos")
count = cur.fetchone()[0]
print(f"\nFilas en la tabla: {count}")

pg.close()
