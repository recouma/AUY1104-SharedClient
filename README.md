# TechMarket Orders — Operación Resiliencia

**Evaluación Final Transversal — AUY1104 Ciclo de Vida del Software II**

**Estudiante:** Daniel Tapia Sobarzo  
**Usuario GitHub / Docker Hub:** recouma  
**Docente:** Andrés Patricio Sánchez Ossandón  
**Fecha:** Julio 2026  
**Jornada:** Vespertina

---

## 1. Resumen del Proyecto

Este repositorio contiene la implementación completa del microservicio "TechMarket Orders" migrado a una arquitectura robusta con despliegue Blue-Green automatizado sobre Kubernetes (K3s) en AWS.

El proyecto integra los tres ítems del encargo EFT: plantillas CI/CD reutilizables (Ítem 1), estrategia de despliegue avanzada Blue-Green (Ítem 2), y mecanismos de remediación automática con rollback (Ítem 3).

### Repositorios

| Repositorio | URL | Función |
|---|---|---|
| SharedClient (este repo) | https://github.com/recouma/AUY1104-SharedClient | App Node.js/Express, manifiestos K8s, pipeline principal |
| SharedWorkflows | https://github.com/recouma/AUY1104-SharedWorkflows | Plantillas reutilizables (`build-push.yaml`, `deploy-bluegreen.yaml`) |
| Docker Hub | https://hub.docker.com/r/recouma/demo-api | Registro de imágenes Docker |

---

## 2. Infraestructura y Setup (Implementación propia)

### 2.1 Aprovisionamiento de la instancia EC2

Se levantó una instancia EC2 en AWS Learner Lab con las siguientes características:

- **Tipo:** t3.small (2 vCPU, 2 GB RAM)
- **SO:** Ubuntu 24.04 LTS
- **Disco:** 20 GB gp3
- **Región:** us-east-1
- **Key Pair:** `eft-k3s-key` (generada con `aws ec2 create-key-pair`)

El Security Group (`eft-k3s-sg`) fue configurado con las siguientes reglas inbound:

| Puerto | Protocolo | CIDR | Uso |
|---|---|---|---|
| 22 | TCP | 0.0.0.0/0 | SSH (administración) |
| 6443 | TCP | 0.0.0.0/0 | API de Kubernetes (kubectl remoto desde GitHub Actions) |
| 30080 | TCP | 0.0.0.0/0 | NodePort debug |
| 30090 | TCP | 0.0.0.0/0 | NodePort servicio Orders |

### 2.2 Instalación de K3s

K3s se instaló como distribución ligera de Kubernetes con el flag `--tls-san` para incluir la IP pública en el certificado TLS, permitiendo conexiones remotas desde GitHub Actions via la API de Kubernetes (puerto 6443):

```bash
curl -sfL https://get.k3s.io | sh -
```

Posterior reconfiguración para acceso remoto:
```bash
sudo sed -i 's|ExecStart=.*|ExecStart=/usr/local/bin/k3s server --tls-san <IP_PUBLICA>|' /etc/systemd/system/k3s.service
echo "K3S_KUBECONFIG_MODE=644" >> /etc/systemd/system/k3s.service.env
sudo systemctl daemon-reload && sudo systemctl restart k3s
```

Versión instalada: **K3s v1.36.2+k3s1**

### 2.3 Despliegue inicial Blue-Green

Se crearon los manifiestos base en `k8s/`:

- `deployment-blue.yaml`: Deployment con 2 réplicas, label `version: blue`, imagen `recouma/demo-api:latest`
- `deployment-green.yaml`: Deployment con 0 réplicas (inactivo), label `version: green`
- `service.yaml`: Service NodePort 30090, selector inicial apuntando a `version: blue`

Ambos deployments incluyen `readinessProbe` y `livenessProbe` en el endpoint `/health` para que Kubernetes detecte automáticamente pods que no responden.

### 2.4 Gestión de Secrets en GitHub

Los secrets fueron configurados en el repositorio SharedClient para ser propagados a las plantillas reutilizables:

| Secret | Uso | Seguridad |
|---|---|---|
| `DOCKER_USERNAME` | Autenticación Docker Hub | Credencial de registro |
| `DOCKER_PASSWORD` | Autenticación Docker Hub | Token de acceso |
| `KUBECONFIG_DATA` | Kubeconfig del clúster K3s codificado en base64 | Acceso al clúster via API 6443 |

La decisión de usar `KUBECONFIG_DATA` con acceso directo a la API de K3s en vez de SSH se tomó porque los runners de GitHub Actions tienen IPs variables que hacen inestable la conexión SSH. El acceso via kubeconfig al puerto 6443 es más confiable y es el patrón estándar en pipelines CI/CD para Kubernetes.

### 2.5 Historial de commits y evolución

El historial de commits refleja la evolución iterativa del proyecto:

1. Implementación inicial de plantillas reutilizables (`build-push.yaml`, `deploy-bluegreen.yaml`)
2. Archivado de workflows anteriores (EA1, EA3) para evitar conflictos con el pipeline Blue-Green
3. Migración de SSH a kubeconfig directo por estabilidad
4. Configuración TLS-SAN para certificados válidos
5. Codificación base64 del kubeconfig para preservar formato YAML en secrets

Cada decisión está documentada en el mensaje de commit correspondiente, explicando el por qué del cambio.

---

## 3. Pipeline CI/CD y Plantillas Reutilizables (Ítem 1)

### 3.1 Arquitectura del pipeline

```
Push tag v*.*.* → GitHub Actions
  → Job 1: tests (npm test, 6 tests, 2 suites)
    → Job 2: build-and-push (plantilla SharedWorkflows)
      → Job 3: deploy-bluegreen (plantilla SharedWorkflows)
        → Determinar color activo
        → Desplegar al color inactivo
        → Health check
        → Switch de tráfico (o rollback si falla)
```

### 3.2 Plantilla `build-push.yaml` (SharedWorkflows)

Workflow reutilizable via `workflow_call` que recibe:
- **Inputs:** `image_name`, `image_tag` (parametrizados para cualquier proyecto)
- **Secrets:** `DOCKER_USERNAME`, `DOCKER_PASSWORD`

Ejecuta: checkout → login Docker Hub → build con tag SemVer → push imagen + tag latest.

### 3.3 Plantilla `deploy-bluegreen.yaml` (SharedWorkflows)

Workflow reutilizable que implementa el despliegue Blue-Green completo:
- **Inputs:** `image_name`, `image_tag`
- **Secrets:** `KUBECONFIG_DATA`

Pasos:
1. **Setup kubeconfig:** decodifica base64 y configura `~/.kube/config`
2. **Verify cluster:** `kubectl get nodes` para confirmar conectividad
3. **Determine active color:** consulta el selector del Service para saber si Blue o Green está activo
4. **Deploy to inactive:** actualiza imagen y escala a 2 réplicas el deployment inactivo
5. **Health check:** ejecuta curl al `/health` del pod nuevo
6. **Switch traffic:** si el health check pasa, cambia el selector del Service al nuevo color
7. **Rollback automático:** si cualquier paso falla (`if: failure()`), escala a 0 el deployment fallido y mantiene el activo

### 3.4 Pipeline principal `deploy-bluegreen.yaml` (SharedClient)

Consume ambas plantillas del repositorio central con `workflow_call`, propagando secrets. Se activa con tags SemVer (`v*.*.*`) y también permite ejecución manual (`workflow_dispatch`).

---

## 4. Estrategia de Despliegue Blue-Green (Ítem 2)

### 4.1 Cómo funciona en este proyecto

Blue-Green mantiene dos ambientes idénticos en paralelo. Solo uno recibe tráfico de usuarios a través del Service de Kubernetes. El selector del Service (`version: blue` o `version: green`) actúa como el "interruptor" que controla qué ambiente está vivo.

El flujo implementado es:

1. El Service apunta a Blue (versión estable actual)
2. El pipeline despliega la nueva versión a Green (inactivo)
3. Se ejecuta health check contra los pods de Green
4. Si Green responde HTTP 200 en `/health`, se cambia el selector del Service a Green
5. Se escalan a 0 las réplicas de Blue
6. En el siguiente deploy, los roles se invierten: Blue pasa a ser el target

### 4.2 Ventajas de Blue-Green para TechMarket Orders

Este es un servicio crítico de procesamiento de pedidos. Blue-Green es la estrategia adecuada porque ofrece cambio de tráfico atómico (no hay coexistencia de versiones, lo que evita inconsistencias en el procesamiento de órdenes), rollback instantáneo (cambiar el selector de vuelta toma menos de 1 segundo), y validación completa antes de exponer a usuarios (el health check verifica Green antes del switch).

### 4.3 Comparación con otras estrategias

| Variable | Rolling Update | Blue-Green | Canary |
|---|---|---|---|
| Downtime | Cero (gradual) | Cero (switch atómico) | Cero (gradual) |
| Coexistencia de versiones | Sí (temporal) | No | Sí (controlada) |
| Velocidad de rollback | ~10s (rollout undo) | Instantáneo (selector) | Media (escalar canary) |
| Costo infraestructura | Bajo | Alto (doble recursos) | Medio |
| Riesgo para usuarios | Medio (versiones mixtas) | Bajo (validación previa) | Bajo (% controlado) |
| Complejidad | Baja (nativa K8s) | Media (2 deployments + service) | Alta (traffic splitting) |

Para TechMarket, el costo adicional de mantener dos deployments se justifica por la criticidad del servicio de órdenes, donde una versión defectuosa podría afectar transacciones reales.

### 4.4 Descripción de las 4 estrategias en contexto Kubernetes

**All-in-once (Recreate):** Elimina todos los pods de la versión anterior antes de crear los nuevos. Genera downtime pero garantiza que no coexistan versiones. Útil para migraciones de base de datos que no soportan compatibilidad hacia atrás.

**Rolling Update:** Estrategia por defecto en Kubernetes. Reemplaza pods gradualmente respetando `maxSurge` y `maxUnavailable`. No requiere infraestructura adicional pero permite coexistencia temporal de versiones.

**Canary:** Despliega la nueva versión a un porcentaje pequeño de tráfico (controlado por la proporción de réplicas entre el deployment estable y el canary). Si falla, se elimina el deployment canary. Requiere monitoreo de métricas para decidir si escalar.

**Blue-Green:** Mantiene dos ambientes completos. El Service dirige todo el tráfico a uno u otro mediante su selector. El cambio es atómico y el rollback instantáneo.

---

## 5. Remediación Automática (Ítem 3)

### 5.1 Defensa en profundidad

El sistema implementa tres capas de protección:

**Capa 1 — Tests unitarios y de integración:** El pipeline ejecuta 6 tests (3 unitarios + 3 de integración HTTP con Supertest) antes de construir la imagen Docker. Si fallan, el pipeline se detiene y no se construye ni despliega nada.

**Capa 2 — Build Docker:** Si el Dockerfile tiene errores de sintaxis o referencia una imagen base inexistente, el build falla antes del deploy. El clúster no se ve afectado.

**Capa 3 — Health check + rollback automático:** Después de desplegar al ambiente inactivo, se ejecuta un health check contra el pod nuevo. Si el pod no responde HTTP 200 en `/health` (por crash, imagen inválida, error de configuración), el pipeline escala a 0 el deployment fallido y el Service sigue apuntando al ambiente estable. La condición `if: failure()` garantiza que el rollback solo se ejecuta cuando hay un fallo real.

### 5.2 Mecanismo de detección y acción

```
Detección (Health Check / readinessProbe)
    ↓ fallo detectado
Acción (Rollback: escalar a 0 el deployment fallido)
    ↓
Verificación (Service sigue apuntando al ambiente estable)
    ↓
Resultado: servicio disponible, nueva versión descartada
```

Los `readinessProbe` configurados en los manifiestos K8s hacen health checks cada 5 segundos al endpoint `/health`. Un pod que falle 3 checks consecutivos es removido automáticamente del pool del Service por Kubernetes, lo que actúa como una capa adicional de protección independiente del pipeline.

### 5.3 Escenarios de error que el sistema detecta

| Escenario | Detección | Comportamiento |
|---|---|---|
| Tests fallan | Job `tests` retorna exit code 1 | Pipeline se detiene. No se construye imagen. |
| Dockerfile roto | Job `build-and-push` falla | Pipeline se detiene. No se despliega. |
| Imagen inexistente en manifiesto | `rollout status` timeout (ImagePullBackOff) | Rollback: escala a 0 el deployment fallido |
| App crashea al iniciar | `rollout status` timeout (CrashLoopBackOff) | Rollback: escala a 0 el deployment fallido |
| Health check falla (HTTP != 200) | curl al pod retorna error | Rollback: escala a 0, Service sigue estable |
| Pod no pasa readinessProbe | Kubernetes remueve del Service | Pod nunca recibe tráfico |

### 5.4 Impacto en métricas de negocio

La remediación automática reduce el MTTR (Mean Time To Recovery) de minutos (intervención manual) a segundos (rollback automático). En un servicio de procesamiento de pedidos como TechMarket Orders, cada segundo de downtime representa pérdida de transacciones. El patrón Blue-Green garantiza que durante un deploy fallido, los usuarios nunca pierden acceso al servicio porque el ambiente estable sigue activo.

Según las mejores prácticas de CI/CD para Kubernetes, la combinación de health checks automatizados con rollback condicional es el estándar para servicios críticos en entornos ágiles (Harness, 2026; Jeevi Academy, 2026).

---

## 6. Limitaciones y Mejoras Posibles

- **Doble consumo de recursos:** Blue-Green requiere el doble de réplicas durante el deploy. En producción se podría usar Horizontal Pod Autoscaler para optimizar.
- **SSH abierto a 0.0.0.0/0:** Para esta evaluación, el puerto 22 y 6443 están abiertos a todas las IPs. En producción se usaría un bastion host, VPN, o self-hosted runners de GitHub Actions con IPs fijas.
- **Sin notificaciones:** El rollback ocurre silenciosamente. En producción se integraría con Slack o email para alertar al equipo.
- **Sin métricas de observabilidad:** Se podría agregar Prometheus + Grafana para monitoreo en tiempo real y decisiones de rollback basadas en métricas (latencia p99, tasa de errores 5xx).
- **Tags inmutables:** Actualmente se usa `latest` además del tag SemVer. En producción se debería usar exclusivamente el SHA del commit como tag para garantizar reproducibilidad del rollback, como recomiendan las mejores prácticas de imágenes inmutables (295DevOps, 2024).
- **Cache de dependencias:** No se implementó cache de npm ni capas Docker en el pipeline. `actions/cache` reduciría tiempos de ejecución.

---

## 7. Declaración de Uso de IA

Se utilizó Claude (Anthropic) como herramienta de asistencia durante el desarrollo de este proyecto para la generación de código YAML de workflows y manifiestos Kubernetes, depuración de errores en la configuración de GitHub Actions y conexión al clúster, e investigación de mejores prácticas de despliegue Blue-Green y remediación automática. Todo el código generado fue revisado, adaptado y probado por el estudiante. Las decisiones de arquitectura, la resolución de problemas de infraestructura (permisos kubeconfig, certificados TLS, migración de SSH a API directa), y la ejecución del proyecto fueron realizadas por el estudiante.

---

## Referencias

- JABERI, M. H. (2024). *Implementing Blue-Green Deployment in Kubernetes: A Step-by-Step Guide*. Medium. https://medium.com/@jaberi.mohamedhabib/implementing-blue-green-deployment-in-kubernetes-a-step-by-step-guide-071e6cf1d27e
- 295DevOps. (2024). *Buenas Prácticas en CI/CD para Kubernetes y otras yerbas*. https://blog.295devops.com/buenas-practicas-en-cicd-para-kubernetes-y-otras-yerbas
- Harness. (2026). *Kubernetes CI/CD Best Practices for Modern DevOps Teams*. https://www.harness.io/blog/kubernetes-ci-cd-best-practices
- Jeevi Academy. (2026). *Automating Rollbacks in CI/CD Pipelines: A Complete Guide to Building Resilient Deployments*. https://www.jeeviacademy.com/automating-rollbacks-in-ci-cd-pipelines-a-complete-guide-to-building-resilient-deployments/
- Spacelift. (2025). *What are Blue-Green Deployments in Kubernetes?*. https://spacelift.io/blog/blue-green-deployment-kubernetes
- Plural. (2026). *How to kubectl rollout undo deployment Safely*. https://www.plural.sh/blog/kubectl-rollout-undo-deployment/
