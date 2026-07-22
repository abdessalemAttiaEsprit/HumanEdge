# Installation Argo CD (Helm)

Commandes à lancer une fois le cluster GKE prêt et `kubectl` configuré dessus (`gcloud
container clusters get-credentials ...`, voir docs/deployment/02-terraform-gke.md).

```bash
kubectl create namespace argocd

helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Valeurs par défaut du chart = déjà une seule réplique par composant (pas de HA) - correct
# pour un cluster mono-nœud à budget serré, pas besoin d'un values.yaml supplémentaire.
helm install argocd argo/argo-cd --namespace argocd
```

## Récupérer le mot de passe admin initial

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

## Accéder à l'UI (sans exposer Argo CD publiquement, pour ne pas ajouter un 2e Ingress)

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
# puis https://localhost:8080 (utilisateur: admin)
```

## Appliquer le pattern App-of-Apps

```bash
kubectl apply -f infra/argocd/app-of-apps.yaml
```

Argo CD applique alors automatiquement tout ce qui se trouve dans
`infra/argocd/applications/` (aujourd'hui : `backend-frontend.yaml`, qui pointe vers
`infra/k8s/overlays/prod`). Toute évolution ultérieure (ex: ajouter une Application pour le
stack monitoring) se fait en ajoutant un fichier dans ce dossier - Argo CD la détecte seul.

## Vérifier

```bash
kubectl -n argocd get applications
argocd app get hr-app --grpc-web   # nécessite argocd login au préalable
```
