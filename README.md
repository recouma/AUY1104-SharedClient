# AUY1104 — SharedClient (Repositorio Cliente)

Repositorio consumidor con la aplicación Node.js/Express y los pipelines CI/CD para AUY1104.

## Estructura
.github/workflows/
├── client.yaml       ← pipeline de release (por tag v*..)
└── validate.yaml     ← pipeline de validación (por push a feature/**)
src/
├── index.js          ← servidor Express
└── lib/ejemplo.js    ← lógica pura
tests/
├── app.test.js       ← 3 tests HTTP con Supertest
└── ejemplo.test.js   ← 3 tests unitarios
Dockerfile
## Pipelines

### validate.yaml — Validación CI
- Se activa con push a ramas `feature/**` o `fix/**`
- No se ejecuta en main ni por tag
- Pasos: checkout → npm install → npm test → docker build (sin publicar)

### client.yaml — Release
- Se activa exclusivamente con tags `v*.*.*`
- Delega a SharedWorkflows via `workflow_call`
- Jobs: `deps-and-test` → `build-and-push` (Docker Hub)

## Secretos requeridos en GitHub

| Secreto | Descripción |
|---|---|
| `DOCKER_USERNAME` | Usuario de Docker Hub |
| `DOCKER_PASSWORD` | Access Token de Docker Hub |

## Pruebas locales

```bash
npm install
npm test
```

## Docker local

```bash
docker build -t demo-api:local .
docker run --rm -p 3000:3000 demo-api:local
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio |
| GET | `/api/saludo?nombre=X` | Saludo personalizado |
| POST | `/api/echo` | Devuelve el body recibido |

## Imagen en Docker Hub
docker pull recouma/demo-api:latest

## Asignatura

AUY1104 — Ciclo de Vida del Software II · Duoc UC · 2026
