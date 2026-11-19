# Despliegue en AWS (EKS)

Guía para desplegar los microservicios según el diagrama de arquitectura:
Cloudflare → ALB → BFF → servicios gRPC en EKS → RDS, con la SPA en S3 y los
logs de clickstream enviados a S3 por un sidecar Vector.

```text
Usuarios ─HTTPS─▶ Cloudflare ─ /*     ─▶ S3 (SPA)
                            └ /api/*  ─▶ ALB ─▶ bff ─gRPC─▶ auth · catalog · orders · events
                                                              │
                                              RDS (un esquema por servicio)
bff y events ─ sidecar Vector ─▶ S3 (clickstream)
```

## Archivos de esta carpeta

| Archivo | Qué crea |
|---|---|
| `00-namespace.yaml` | Namespace `bookstore` |
| `vector-config.yaml` | Configuración del sidecar Vector (compartida) |
| `catalog.yaml`, `auth.yaml`, `orders.yaml`, `events.yaml` | ConfigMap + Deployment + Service **headless** (gRPC) |
| `bff.yaml` | ConfigMap + Deployment + Service ClusterIP (HTTP :5001) |
| `ingress.yaml` | IngressClass/Params del ALB + Ingress `/api` → `bff` |
| `secrets.yaml.example` | Ejemplo de los Secrets (no se aplica; ver paso 5) |

## Requisitos

- Cuenta de AWS (Learner Lab) con `aws` CLI configurada, `kubectl` y Docker con `buildx`.
- Los 3 recursos de AWS del diagrama creados: **ECR** (5 repositorios), **RDS** PostgreSQL y **EKS**.
- Dos buckets de S3: uno para la SPA y otro para el clickstream.

## 1. Imágenes en ECR

Los pasos están en el [README principal](../README.md#publicar-imágenes). El
resultado: `bookstore-bff`, `-auth`, `-catalog`, `-orders` y `-events` con la
etiqueta que usan los manifiestos (`1.0.0`; si publicas otra, cámbiala en los
5 Deployments).

## 2. Base de datos (RDS)

1. Crea una instancia PostgreSQL y permite el puerto 5432 desde el *security
   group* de los nodos de EKS.
2. Copia `database/rds/bootstrap.env.example` a `database/rds/bootstrap.env`,
   completa el endpoint y las contraseñas (tres roles: `auth_app`,
   `catalog_app`, `orders_app`) y ejecuta:

   ```bash
   bash database/rds/bootstrap.sh
   ```

   Termina con `Verification completed successfully`: crea los esquemas, los
   roles y el seed, y comprueba que cada servicio solo ve su esquema.

## 3. Buckets de S3

- **Clickstream:** un bucket privado. Su nombre va en `S3_BUCKET` del sidecar.
- **SPA:** un bucket para `frontend/dist/` (`npm run build` en `frontend/`).

## 4. Reemplazar los marcadores

Los manifiestos traen valores `REPLACE_WITH_...` que debes cambiar:

```bash
sed -i "s|REPLACE_WITH_ACCOUNT_ID|<tu-cuenta>|g"             k8s/*.yaml
sed -i "s|REPLACE_WITH_RDS_ENDPOINT|<endpoint-de-rds>|g"     k8s/*.yaml
sed -i "s|REPLACE_WITH_CLICKSTREAM_BUCKET|<bucket>|g"        k8s/*.yaml
sed -i "s|REPLACE_WITH_CLOUDFLARE_DOMAIN|<tu-dominio>|g"     k8s/*.yaml
```

## 5. Secrets

Los Secrets reales no se suben al repositorio. Créalos en el cluster
(`secrets.yaml.example` muestra su forma):

```bash
kubectl apply -f k8s/00-namespace.yaml

kubectl -n bookstore create secret generic db-auth    --from-literal=DB_USER=auth_app    --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic db-catalog --from-literal=DB_USER=catalog_app --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic db-orders  --from-literal=DB_USER=orders_app  --from-literal=DB_PASSWORD='<...>'
kubectl -n bookstore create secret generic jwt        --from-literal=AUTH_JWT_SECRET='<mínimo 32 caracteres>'
```

## 6. Aplicar

```bash
aws eks update-kubeconfig --name <cluster> --region us-east-1
kubectl apply -f k8s/
kubectl -n bookstore get pods
```

Cada Deployment debe quedar con 2 réplicas `Running` (los de `bff` y `events`
muestran `2/2`: la aplicación y el sidecar Vector). Si un pod no arranca,
`kubectl -n bookstore logs <pod> -c <contenedor>` muestra el motivo; lo más
común es una variable mal escrita, porque los servicios validan su
configuración al iniciar.

## 7. Cloudflare

Un solo dominio con dos orígenes: `/*` → bucket de la SPA y `/api/*` → el DNS
del ALB (`kubectl -n bookstore get ingress bookstore`). Cloudflare termina el
HTTPS; por eso las cookies son `Secure` y el BFF confía en 2 proxies
(`HTTP_TRUST_PROXY_HOPS=2`).

## 8. Verificar

```bash
curl https://<dominio>/api/books?limit=2          # lista libros (pasa por todo el camino)
kubectl -n bookstore get pods -o wide             # réplicas repartidas entre zonas
```

Inicia sesión en la SPA con `synthetic.customer.0008@bookstore.test` y haz una
compra. Pasados ~60 s deben aparecer objetos en
`s3://<bucket-clickstream>/clickstream/bff/<pod>/AAAA/MM/DD/`.

## Sidecar Vector: cómo funciona

- El BFF y Events escriben el clickstream en `/usr/src/app/logs/clickstream.log`,
  un volumen `emptyDir` compartido con el sidecar.
- Vector lee ese archivo (montado de solo lectura en `/logs`) y envía los
  eventos a S3 en lotes de 60 s, comprimidos con gzip. La clave incluye el
  servicio y el pod, así dos réplicas nunca escriben el mismo objeto.
- Si el contenedor de Vector se reinicia, retoma desde la última línea enviada
  (guarda su posición en otro `emptyDir`). Si se reemplaza el **pod**, los
  eventos que no se alcanzaron a enviar se pierden: es el límite de usar un
  volumen efímero.

### Credenciales de AWS para Vector

Vector usa la cadena estándar de AWS. Hay dos caminos:

1. **Rol del nodo (preferido).** El pod toma las credenciales del rol de las
   instancias (en Learner Lab, `LabRole`), siempre que pueda alcanzar el
   servicio de metadatos. Si en los logs de Vector aparece un error de
   credenciales, es porque los pods no lo alcanzan (límite de saltos del
   IMDS en 1).
2. **Secret de respaldo.** Copia las credenciales temporales del panel
   *AWS Details* del laboratorio y crea el Secret; los sidecars lo toman solos
   (está declarado como opcional):

   ```bash
   kubectl -n bookstore create secret generic aws-credentials \
     --from-literal=AWS_ACCESS_KEY_ID='<...>' \
     --from-literal=AWS_SECRET_ACCESS_KEY='<...>' \
     --from-literal=AWS_SESSION_TOKEN='<...>'
   kubectl -n bookstore rollout restart deploy/bff deploy/events
   ```

   Las credenciales del laboratorio caducan con la sesión: hay que
   renovarlas cada vez.

El rol (o las credenciales) necesita `s3:PutObject` sobre el bucket de
clickstream.

## Limpieza (importante con créditos limitados)

El control plane de EKS, los NAT Gateway y RDS cobran por hora aunque no haya
tráfico. Al terminar la sesión:

```bash
kubectl delete -f k8s/          # elimina pods y el ALB
```

y borra o detén el cluster y la instancia de RDS.
