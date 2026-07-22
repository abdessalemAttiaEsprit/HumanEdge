# 4. Kubernetes + GitOps (Argo CD)

Cette étape est **indépendante du cloud** (GCP ou Azure) - Helm et `kubectl` parlent à
l'API Kubernetes du cluster créé en [02-terraform-gke.md](02-terraform-gke.md), pas
directement à l'API GCP.

## 4.1 Ingress-nginx (contrôleur d'entrée)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```
- `helm repo add`/`update` : voir explication détaillée en [03-secrets.md](03-secrets.md#31-installer-le-contrôleur-dans-le-cluster)
  - même mécanique, dépôt différent.
- `helm install ingress-nginx ingress-nginx/ingress-nginx` : déploie le contrôleur
  ingress-nginx (un pod qui lit les objets `Ingress` du cluster et route le trafic HTTP en
  fonction du host demandé).
- `--namespace ingress-nginx --create-namespace` : namespace dédié, créé s'il n'existe pas
  encore (`--create-namespace` évite un `kubectl create namespace` séparé au préalable).
- **Effet côté GCP** : ce chart crée par défaut un `Service` de type `LoadBalancer` - GKE
  détecte automatiquement cet objet et provisionne en retour une **Network Load Balancer**
  GCP avec une IP publique (c'est le mécanisme du cloud-controller-manager de GKE, pas une
  action manuelle de ta part).

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
# attendre que EXTERNAL-IP passe de <pending> à une IP publique
```
- Interroge l'objet `Service` créé par le chart. `EXTERNAL-IP` reste `<pending>` tant que
  GCP n'a pas fini de provisionner le Load Balancer associé (généralement 30s à 2 min) -
  relance la commande jusqu'à voir une IP.

Si tu n'as pas de nom de domaine, tu peux utiliser un service comme
[nip.io](https://nip.io/) pour tester : si l'IP publique est `34.1.2.3`, alors
`hr.34.1.2.3.nip.io` résout automatiquement vers cette IP, sans configuration DNS. Adapte
dans ce cas les hosts dans `infra/k8s/base/ingress.yaml` et `overlays/*/patch-configmap.yaml`.

## 4.2 cert-manager (certificats TLS Let's Encrypt)

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set installCRDs=true
```
- Même mécanique Helm que 4.1, dépôt `jetstack` (mainteneur officiel de cert-manager).
- `--set installCRDs=true` : cert-manager définit ses propres types de ressources
  Kubernetes (`Certificate`, `ClusterIssuer`...) via des CRDs (Custom Resource Definitions)
  - sans ce flag, les CRDs ne seraient pas installées et le chart échouerait à créer ses
  propres objets.

Édite `infra/k8s/cluster-addons/cluster-issuer.yaml` (remplace `<TON_EMAIL>`), puis :

```bash
kubectl apply -f infra/k8s/cluster-addons/cluster-issuer.yaml
kubectl get clusterissuer letsencrypt-prod
# READY doit passer à True après quelques secondes
```
- `kubectl apply -f` : envoie ce manifeste unique au cluster (par opposition à
  `kubectl apply -k` utilisé ailleurs pour un dossier Kustomize) - un `ClusterIssuer` décrit
  **comment** cert-manager doit demander des certificats (ici : Let's Encrypt, protocole
  ACME HTTP-01).
- `kubectl get clusterissuer` : vérifie que cert-manager a réussi à s'enregistrer auprès de
  Let's Encrypt avec l'email fourni - `READY=False` durablement indique en général un
  problème réseau sortant du cluster (rare) ou un email invalide.

> nip.io ne permet pas toujours la validation HTTP-01 de Let's Encrypt de façon fiable
> derrière un Load Balancer cloud - pour un vrai certificat TLS, un nom de domaine réel
> (même bon marché, acheté chez n'importe quel registrar) reste plus fiable.

## 4.3 Installer Argo CD

Voir [infra/argocd/install/NOTES.md](../../infra/argocd/install/NOTES.md) pour le détail :
en résumé, `helm install argocd argo/argo-cd --namespace argocd --create-namespace` puis
récupérer le mot de passe admin initial.

## 4.4 Remplacer les placeholders avant le premier sync

Assure-toi d'avoir déjà remplacé (étape 1) :
- `<TON_USER_DOCKERHUB>` dans `infra/k8s/overlays/{prod,dev}/kustomization.yaml`
- `<TON_USER_GITHUB>` dans `infra/argocd/app-of-apps.yaml` et
  `infra/argocd/applications/backend-frontend.yaml`
- les hosts `hr.example.com` / `api.hr.example.com` si tu utilises un vrai domaine ou nip.io

Et que le secret scellé existe (étape 3) : `infra/k8s/overlays/prod/sealed-secret.yaml`
référencé dans `infra/k8s/overlays/prod/kustomization.yaml`.

Commit et push ces changements avant de continuer - Argo CD lit l'état depuis Git, pas
depuis ton disque local (c'est le principe même de GitOps : la source de vérité est le
dépôt, pas une commande `kubectl apply` lancée à la main).

## 4.5 Déployer via le pattern App-of-Apps

```bash
kubectl apply -f infra/argocd/app-of-apps.yaml
kubectl -n argocd get applications
```
- `kubectl apply -f infra/argocd/app-of-apps.yaml` : crée une **unique** ressource
  `Application` Argo CD (`hr-root`) qui pointe elle-même vers un dossier contenant d'autres
  manifestes `Application` - c'est le pattern "App of Apps" : une seule commande manuelle
  fait ensuite apparaître toutes les autres Applications automatiquement.
- `kubectl -n argocd get applications` : liste les objets `Application` connus d'Argo CD
  dans son propre namespace de contrôle.

Argo CD doit faire apparaître `hr-root` (synced) puis `hr-app` (généré automatiquement),
qui applique `infra/k8s/overlays/prod`.

## 4.6 Vérifier

```bash
kubectl -n hr get pods,svc,ingress,pvc
# hr-backend, hr-frontend et hr-ollama doivent passer Running/Ready
```
- Liste en une seule commande (types séparés par des virgules) les quatre types d'objets
  clés du namespace `hr` : les pods applicatifs, les Services internes, l'Ingress externe,
  et les PersistentVolumeClaims (stockage des uploads/modèles Ollama).

```bash
kubectl -n hr port-forward svc/hr-backend 8081:8081
curl http://localhost:8081/actuator/health/readiness
```
- `port-forward` : ouvre un tunnel TCP temporaire entre ton port local `8081` et le port
  `8081` du Service `hr-backend` **à l'intérieur** du cluster - sans passer par l'Ingress/
  Load Balancer public, utile pour tester rapidement en debug. Reste bloqué au premier plan
  tant que tu ne fais pas Ctrl+C.
- `curl .../actuator/health/readiness` : endpoint Spring Boot Actuator qui répond `200` une
  fois l'app **prête** à recevoir du trafic (connexion DB établie, etc.) - différent de
  `/health` qui répond dès que le process a démarré.

Si `hr-backend` reste en `CreateContainerConfigError`, c'est presque toujours que
`hr-backend-secrets` n'existe pas encore (étape 3 pas terminée) - vérifie avec
`kubectl -n hr get secret`.

## 4.7 Vérifier qu'Ollama a bien récupéré son modèle

Le premier démarrage télécharge le modèle (`OLLAMA_MODEL` défini dans
`infra/k8s/base/configmap.yaml`, `llama3.2:3b` par défaut) - ça peut prendre plusieurs
minutes selon la bande passante du cluster :

```bash
kubectl -n hr logs deploy/hr-ollama --follow
# chercher une ligne confirmant que le pull est terminé (success/"writing manifest")
```
- `logs deploy/hr-ollama` : `kubectl` résout automatiquement le Deployment `hr-ollama` vers
  son pod actif et en lit les logs (raccourci équivalent à cibler le pod directement).
- `--follow` (ou `-f`) : garde le flux ouvert et affiche les nouvelles lignes au fur et à
  mesure, comme `tail -f`.

```bash
kubectl -n hr exec deploy/hr-ollama -- ollama list
# le modèle doit apparaître dans la liste
```
- `kubectl exec ... --` : exécute la commande après `--` (`ollama list`, la CLI native
  d'Ollama) **à l'intérieur** du conteneur `hr-ollama`, comme un `docker exec`.

Tant que le modèle n'est pas présent, un appel à la fonctionnalité IA du backend renverra
une erreur explicite (modèle introuvable) plutôt qu'un plantage - relance simplement
l'appel une fois `ollama list` confirmé.
