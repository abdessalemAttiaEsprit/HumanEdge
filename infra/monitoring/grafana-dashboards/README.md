# Dashboards Grafana à importer

Dans Grafana (Dashboards > New > Import), entrer l'ID puis choisir le datasource
Prometheus créé par le chart (`kube-prometheus-stack-prometheus` en général) :

| ID | Dashboard | Utile pour |
|----|-----------|------------|
| 4701 | JVM (Micrometer) | Heap, GC, threads du backend Spring Boot |
| 12900 | Spring Boot 2.1 System Monitor | Requêtes HTTP, statuts, latence par endpoint |
| 9614 | NGINX Ingress Controller | Trafic entrant via ingress-nginx |
| 315 | Kubernetes cluster monitoring (via kube-state-metrics) | Vue d'ensemble nœud/pods |

Ces dashboards communautaires ne correspondent pas toujours exactement aux noms de
métriques exposées par la version de Micrometer/Actuator utilisée ici - si un panel reste
vide, ouvre son éditeur de requête et ajuste le nom de métrique (`http_server_requests_seconds_count`,
`jvm_memory_used_bytes`, etc., visibles dans Prometheus > Graph en tapant `jvm_` ou `http_server`).

Pour vérifier que le backend est bien scrappé avant d'importer les dashboards :
`kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090`, puis
Status > Targets sur `http://localhost:9090` → la cible `hr-backend` doit être `UP`.
