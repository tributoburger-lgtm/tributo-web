# Tributo Web — POS Multidispositivo

## Arquitectura
- **Backend**: FastAPI + PostgreSQL (Railway)
- **Frontend**: React + Vite + Tailwind (Netlify)

---

## Paso 1 — Crear cuenta en Railway

1. Ve a https://railway.app y crea cuenta con GitHub
2. Clic en **New Project → PostgreSQL**
3. Copia la variable `DATABASE_URL` que genera Railway

---

## Paso 2 — Subir backend a Railway

1. Crea un repositorio en GitHub y sube la carpeta `backend/`
2. En Railway: **New Project → Deploy from GitHub Repo**
3. Selecciona tu repo
4. En **Variables**, agrega:
   ```
   DATABASE_URL=<la que copiaste>
   SECRET_KEY=<genera con: python -c "import secrets; print(secrets.token_hex(32))">
   ```
5. Railway detecta el `Procfile` y despliega automáticamente
6. Copia la URL pública que Railway te da (ej: `https://tributo-xxx.railway.app`)

---

## Paso 3 — Crear tablas en PostgreSQL

Una vez desplegado, abre la consola de Railway y ejecuta:
```bash
python -c "from app.core.database import engine, Base; from app.models.models import *; Base.metadata.create_all(engine); print('Tablas creadas')"
```

---

## Paso 4 — Migrar datos de SAPOS

En tu PC, con Python instalado:
```bash
pip install psycopg2-binary
python migrate_sqlite_to_pg.py \
  --sqlite "C:/SAPOS/data/sapos.db" \
  --pg "postgresql://..."
```

---

## Paso 5 — Subir frontend a Netlify

1. Ve a https://netlify.app y crea cuenta
2. En la carpeta `frontend/`, crea el archivo `.env`:
   ```
   VITE_API_URL=https://tributo-xxx.railway.app
   ```
3. Ejecuta `npm install && npm run build`
4. Arrastra la carpeta `dist/` a Netlify
5. Tu POS queda en `https://tu-app.netlify.app`

---

## Desarrollo local

### Backend
```bash
cd backend
pip install -r requirements.txt
# Crear .env con DATABASE_URL local o de Railway
uvicorn app.main:app --reload
# API disponible en http://localhost:8000
# Docs en http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App en http://localhost:5173
```

---

## Estado actual del proyecto

### ✅ Completo
- Autenticación JWT (login, logout, roles)
- Modelos PostgreSQL (espejo exacto de SAPOS)
- Script de migración SQLite → PostgreSQL
- API de productos, ventas, inventario, caja, reportes
- POS completo con carrito, variantes, cobro
- Layout con sidebar navegación
- Login page
- Inventario con stock y estados
- Estado de resultados con dividendos

### 🔨 En desarrollo (próximas fases)
- Restaurant (mesas y pedidos)
- Caja completa (turnos, egresos, cuentas digitales)
- Compras
- Clientes
- Kardex interactivo
- Impresión de tickets
- Notificaciones en tiempo real (WebSockets)
