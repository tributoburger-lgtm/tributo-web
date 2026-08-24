"""
Migracion: agrega soporte multi-empresa a la base de datos ya existente.

Que hace, en orden:
  1. Crea la tabla 'empresas' y siembra Tributo, Destilado Bodegon,
     Comercializadora Chagoz (si no existen ya).
  2. Crea 'empresa_modulos' (que ve cada empresa en el sidebar) y la
     siembra con valores por defecto razonables.
  3. Crea 'usuario_empresa' y le da a cada usuario existente acceso a
     las 3 empresas (lo puedes restringir despues desde la app).
  4. Agrega la columna empresa_id a las 12 tablas operativas, y le
     asigna TODOS los datos que ya existen a 'Tributo' (porque hoy
     todo lo que hay en la base es de Tributo).
  5. Cambia los campos que eran "unicos globalmente" (codigo de
     producto, numero de venta, numero de mesa, etc.) a "unicos por
     empresa", para que Destilado y Chagoz puedan tener su propia
     numeracion sin chocar con la de Tributo.

Es seguro correrlo mas de una vez (es idempotente) - si algo ya esta
hecho, lo salta.

Uso:
  python migrate_add_empresas.py --pg postgresql://user:pass@host/db
"""
import argparse
import psycopg2


TABLAS_CON_EMPRESA = [
    "almacenes", "categorias", "proveedores", "productos", "clientes",
    "ventas", "turnos_caja", "egresos_caja", "ingresos_caja", "mesas",
    "compras", "tasas_de_cambio", "mermas",
]

# (tabla, columna) que antes eran UNIQUE globalmente y ahora deben
# ser unicos por empresa
CAMPOS_UNIQUE_A_MIGRAR = [
    ("productos", "codigo"),
    ("productos", "codigo_barras"),
    ("clientes", "rif_cedula"),
    ("ventas", "numero_venta"),
    ("mesas", "numero"),
    ("compras", "numero_compra"),
    ("almacenes", "nombre"),
    ("categorias", "nombre"),
]

EMPRESAS_SEED = [
    ("Tributo", "Comercializadora Chagoz C.A.", "#F5A623"),
    ("Destilado Bodegon", "Comercializadora Chagoz C.A.", "#4A9EFF"),
    ("Comercializadora Chagoz", "Comercializadora Chagoz C.A.", "#9B72FF"),
]

MODULOS_POR_DEFECTO = {
    "Tributo":                 ["POS", "RESTAURANT", "VENTAS", "INVENTARIO", "RECETAS", "CAJA", "COMPRAS", "CLIENTES", "REPORTES"],
    "Destilado Bodegon":       ["POS", "VENTAS", "INVENTARIO", "RECETAS", "CAJA", "COMPRAS", "CLIENTES", "REPORTES"],
    "Comercializadora Chagoz": ["POS", "VENTAS", "INVENTARIO", "RECETAS", "CAJA", "COMPRAS", "CLIENTES", "REPORTES"],
}


def col_exists(cur, tabla, columna):
    cur.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name=%s AND column_name=%s
    """, (tabla, columna))
    return cur.fetchone() is not None


def find_unique_constraint(cur, tabla, columna):
    """Encuentra el nombre real del constraint UNIQUE de una sola columna."""
    cur.execute("""
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name=%s AND tc.constraint_type='UNIQUE'
          AND kcu.column_name=%s
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 1
    """, (tabla, columna))
    row = cur.fetchone()
    return row[0] if row else None


def migrate(pg_url: str):
    pg = psycopg2.connect(pg_url)
    pg.autocommit = False
    cur = pg.cursor()

    try:
        # === 1. Tabla empresas ===
        print("=== 1. Tabla empresas ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS empresas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                razon_social VARCHAR(150),
                rif VARCHAR(30),
                color VARCHAR(20) DEFAULT '#F5A623',
                logo_path VARCHAR(255),
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT NOW()
            )
        """)
        for nombre, razon, color in EMPRESAS_SEED:
            cur.execute("SELECT id FROM empresas WHERE nombre=%s", (nombre,))
            if cur.fetchone():
                print(f"  '{nombre}' ya existe, se salta")
                continue
            cur.execute(
                "INSERT INTO empresas (nombre, razon_social, color) VALUES (%s,%s,%s)",
                (nombre, razon, color)
            )
            print(f"  '{nombre}' creada")
        pg.commit()

        cur.execute("SELECT id, nombre FROM empresas")
        empresas = {nombre: id_ for id_, nombre in cur.fetchall()}
        tributo_id = empresas["Tributo"]
        print(f"  Mapa de empresas: {empresas}")

        # === 2. empresa_modulos ===
        print("\n=== 2. Tabla empresa_modulos ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS empresa_modulos (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                modulo VARCHAR(30) NOT NULL,
                activo BOOLEAN DEFAULT TRUE,
                UNIQUE(empresa_id, modulo)
            )
        """)
        for nombre_empresa, modulos in MODULOS_POR_DEFECTO.items():
            eid = empresas[nombre_empresa]
            for m in modulos:
                cur.execute("""
                    INSERT INTO empresa_modulos (empresa_id, modulo, activo)
                    VALUES (%s, %s, TRUE)
                    ON CONFLICT (empresa_id, modulo) DO NOTHING
                """, (eid, m))
        pg.commit()
        print("  Modulos sembrados para las 3 empresas")

        # === 3. usuario_empresa ===
        print("\n=== 3. Tabla usuario_empresa ===")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS usuario_empresa (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                creado_en TIMESTAMP DEFAULT NOW(),
                UNIQUE(usuario_id, empresa_id)
            )
        """)
        cur.execute("SELECT id FROM usuarios")
        usuario_ids = [r[0] for r in cur.fetchall()]
        for uid in usuario_ids:
            for eid in empresas.values():
                cur.execute("""
                    INSERT INTO usuario_empresa (usuario_id, empresa_id)
                    VALUES (%s, %s) ON CONFLICT DO NOTHING
                """, (uid, eid))
        pg.commit()
        print(f"  {len(usuario_ids)} usuario(s) con acceso a las 3 empresas")

        # === 4. empresa_id en tablas operativas ===
        print("\n=== 4. Agregando empresa_id a tablas operativas ===")
        for tabla in TABLAS_CON_EMPRESA:
            if col_exists(cur, tabla, "empresa_id"):
                print(f"  {tabla}: ya tiene empresa_id, se salta")
                continue
            cur.execute(f'ALTER TABLE {tabla} ADD COLUMN empresa_id INTEGER')
            cur.execute(f'UPDATE {tabla} SET empresa_id = %s WHERE empresa_id IS NULL', (tributo_id,))
            cur.execute(f'ALTER TABLE {tabla} ALTER COLUMN empresa_id SET NOT NULL')
            cur.execute(f"""
                ALTER TABLE {tabla}
                ADD CONSTRAINT fk_{tabla}_empresa
                FOREIGN KEY (empresa_id) REFERENCES empresas(id)
            """)
            pg.commit()
            print(f"  {tabla}: empresa_id agregado, datos existentes -> Tributo")

        # === 5. Unicidad global -> unicidad por empresa ===
        print("\n=== 5. Ajustando UNIQUE constraints a nivel de empresa ===")
        for tabla, columna in CAMPOS_UNIQUE_A_MIGRAR:
            cname = find_unique_constraint(cur, tabla, columna)
            if cname:
                cur.execute(f'ALTER TABLE {tabla} DROP CONSTRAINT "{cname}"')
                print(f"  {tabla}.{columna}: constraint global '{cname}' eliminado")
            new_name = f"uq_{tabla}_empresa_{columna}"
            cur.execute(f"""
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name=%s AND constraint_name=%s
            """, (tabla, new_name))
            if cur.fetchone():
                print(f"  {tabla}.{columna}: ya tiene constraint por empresa, se salta")
                continue
            cur.execute(f"""
                ALTER TABLE {tabla}
                ADD CONSTRAINT {new_name} UNIQUE (empresa_id, {columna})
            """)
            print(f"  {tabla}.{columna}: ahora es unico por empresa")
        pg.commit()

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
