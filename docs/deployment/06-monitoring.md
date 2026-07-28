# 6. Monitoring (Prometheus + Grafana)

Stack allégé (pas d'Alertmanager, rétention courte, faibles `requests`) pour tenir sur le
nœud `e2-standard-2` (2 vCPU/8 Go) partagé avec le backend/frontend/Ollama/Argo CD. Comme
pour l'étape 4, cette partie est **indépendante du cloud** - uniquement Helm/kubectl.

## 6.1 Installer kube-prometheus-stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f infra/monitoring/prometheus-grafana-values.yaml
```
- `helm repo add`/`update` : voir [03-secrets.md](03-secrets.md#31-installer-le-contrôleur-dans-le-cluster) -
  même mécanique, dépôt `prometheus-community`.
- `helm install kube-prometheus-stack ...` : ce chart installe **plusieurs** composants
  d'un coup (Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics) via un
  seul objet Helm - c'est la référence pour du monitoring Kubernetes "clé en main".
- `-f infra/monitoring/prometheus-grafana-values.yaml` : fichier de **values** qui
  surcharge la config par défaut du chart (désactive Alertmanager, réduit la rétention et
  les `requests` CPU/mémoire) - sans lui, le chart par défaut est bien trop gourmand pour
  un nœud unique de 8 Go partagé avec le reste de l'app.

```bash
kubectl -n monitoring get pods
# attendre que tout soit Running (peut prendre 2-3 min)
```
- Liste les pods du namespace `monitoring` - avec autant de composants installés d'un coup,
  il est normal que certains mettent quelques minutes à passer `Running` (téléchargement
  des images, initialisation de Prometheus).

Si des pods restent `Pending`, c'est un signe que le nœud unique est à court de
CPU/mémoire (`kubectl describe pod <nom> -n monitoring` → section Events) - voir
[07-checklist-securite-budget.md](07-checklist-securite-budget.md) pour les options
(réduire encore les `requests`, ou passer à un `e2-standard-4`).

## 6.2 Brancher le scrape du backend

Le CRD `ServiceMonitor` n'existe qu'une fois le stack ci-dessus installé, donc cette étape
vient après :

```bash
kubectl apply -f infra/monitoring/servicemonitor-backend.yaml
```
- Applique un objet `ServiceMonitor` (CRD fourni par kube-prometheus-stack) qui dit à
  Prometheus **où** aller chercher les métriques du backend (quel Service, quel port, quel
  chemin - `/actuator/prometheus` exposé par Spring Boot Actuator) - Prometheus découvre
  automatiquement ce nouvel objet sans redémarrage.

## 6.3 Vérifier que le backend est bien scrappé

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090
```
- Ouvre un tunnel local vers l'UI web de Prometheus (voir explication `port-forward` en
  [04-kubernetes-gitops.md](04-kubernetes-gitops.md#46-vérifier)) - reste bloqué au
  premier plan tant que tu ne fais pas Ctrl+C.

Ouvrir `http://localhost:9090/targets` → une cible `hr-backend` (namespace `hr`) doit
apparaître à l'état **UP**. Si elle n'apparaît pas du tout, vérifier que
`serviceMonitorSelectorNilUsesHelmValues: false` est bien dans les values appliquées
(`helm get values kube-prometheus-stack -n monitoring`).

## 6.4 Accéder à Grafana

```bash
kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d
```
- Le chart génère un mot de passe admin Grafana aléatoire et le stocke dans un `Secret`
  Kubernetes (jamais en clair dans les values). `-o jsonpath="{.data.admin-password}"`
  extrait uniquement ce champ (le `Secret` complet contiendrait aussi le login, encodés
  tous deux en base64 - format natif des Secrets Kubernetes). `| base64 -d` décode la
  valeur pour l'afficher en clair dans le terminal.

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
# http://localhost:3000  (utilisateur: admin)
```
- Même mécanique de tunnel que 6.3, vers le port `80` du Service Grafana (mappé en local
  sur `3000`).

## 6.5 Importer les dashboards

Voir [infra/monitoring/grafana-dashboards/README.md](../../infra/monitoring/grafana-dashboards/README.md)
pour les IDs à importer (JVM Micrometer, Spring Boot, nginx ingress, vue cluster).

## 6.6 Surveiller la charge du nœud

```bash
kubectl top nodes
kubectl top pods -A
```
- `kubectl top nodes` : consommation CPU/mémoire réelle de l'unique nœud, comparée à sa
  capacité totale (2 vCPU/8 Go) - nécessite que `metrics-server` tourne dans le cluster
  (installé par défaut sur GKE, contrairement à certaines distributions Kubernetes).
- `kubectl top pods -A` : même chose, détaillé par pod, tous namespaces confondus
  (`-A` = `--all-namespaces`) - permet d'identifier lequel des composants (backend,
  Ollama, Prometheus...) consomme le plus.

Utile pour savoir si le budget de 8 Go du nœud est tenu une fois backend + frontend +
Ollama + Argo CD + monitoring tous démarrés en même temps - Ollama est le plus gros
consommateur de mémoire du lot, voir [07-checklist-securite-budget.md](07-checklist-securite-budget.md)
si `kubectl top pods -A` montre une pression mémoire.

## 6.7 Effet de bord vécu : capacité CPU chroniquement tendue

Une fois `kube-prometheus-stack` installé, le nœud unique `e2-standard-2` (2 vCPU) tourne à
**~86% de CPU réservée** (`requests`), même sans le pod backend démarré - Prometheus,
Grafana, node-exporter, kube-state-metrics et Argo CD suffisent à eux seuls à consommer la
quasi-totalité de la capacité. Conséquence concrète : **chaque rolling update du backend
échoue en `Insufficient cpu`**, car un `Deployment` a besoin de la capacité de l'ancien ET
du nouveau pod en même temps le temps de la bascule, et il n'y a plus assez de place.

```bash
kubectl -n hr get rs
# repérer l'ancien ReplicaSet (celui à 0 pods Ready qui bloque le nouveau)
kubectl -n hr scale rs <ancien-replicaset> --replicas=0
```
Libère immédiatement la capacité de l'ancien pod, permettant au nouveau de devenir `Ready`.
C'est arrivé 2 fois de suite pendant cette phase (déploiement du "mot de passe oublié", puis
du Cloud SQL Auth Proxy) - **à prévoir pour chaque futur déploiement backend** tant que le
node pool Ollama dédié (`e2-standard-4`, amélioration "Retenu" du budget, voir
[ressources-budget-gcp.md](ressources-budget-gcp.md)) n'est pas implémenté. Autre levier déjà
utilisé : réduire au minimum les `requests` des nouveaux conteneurs ajoutés (ex. le side-car
`cloud-sql-proxy` a été descendu à `10m`/`32Mi`, voir
[07-checklist-securite-budget.md](07-checklist-securite-budget.md)).

## 6.8 Piège vécu : dashboard communautaire incompatible cgroup v2

Le dashboard Grafana communautaire **ID 315** ("Kubernetes cluster monitoring (via
Prometheus)"), souvent recommandé dans les tutoriels, affiche tous ses panneaux en **N/A**
sur ce cluster. Cause : il dépend de métriques cgroup v1 qui n'existent plus telles quelles
sur les nœuds GKE modernes (cgroup v2) - par exemple l'agrégat racine
`container_memory_working_set_bytes{id="/"}` n'est plus exposé de la même façon, et
`machine_memory_bytes{kubernetes_io_hostname=~...}` ne matche plus le format de label actuel.

**Ne pas importer ce dashboard.** Utiliser à la place les dashboards **intégrés au chart**
(`defaultDashboardsEnabled: true`, déjà actif dans
`infra/monitoring/prometheus-grafana-values.yaml`), en particulier "Kubernetes / Compute
Resources / Cluster" - déjà présents dans Grafana sans rien importer, et maintenus à jour
avec les conventions de métriques actuelles de `kube-state-metrics`/`node-exporter`.
