# 9. Commandes opérationnelles

Aide-mémoire pratique : une fois l'infra en place ([00](00-overview.md) à
[08](08-domaine-reel.md)), ce chapitre répond à deux questions récurrentes au quotidien -
**"je viens de modifier quelque chose, qu'est-ce que je dois lancer ?"** et **"comment
éteindre/rallumer le cluster proprement ?"**. Il renvoie vers les chapitres détaillés pour le
"pourquoi" de chaque commande plutôt que de le répéter.

## 9.1 Après une modification de code applicatif (`backend/**`, `frontend/**`)

Flux entièrement automatique une fois poussé - voir [05-cicd-github-actions.md](05-cicd-github-actions.md).

```bash
git add backend   # ou frontend, selon ce qui a changé
git commit -m "..."
git push origin main
```

Puis vérifier :
```bash
# onglet Actions du repo GitHub : les workflows doivent passer au vert
kubectl -n hr rollout status deployment/hr-backend   # ou hr-frontend
```

- Pas de `kubectl apply` ni de rebuild Docker manuel nécessaire : la CI construit l'image,
  la pousse sur Docker Hub, bump le tag dans Kustomize, et Argo CD synchronise seul
  (~3 min de polling, voir [5.3](05-cicd-github-actions.md#53-ce-que-font-les-workflows)).
- Pour ne pas attendre le polling : `argocd app sync hr-app` (voir
  [5.5](05-cicd-github-actions.md#55-forcer-une-synchronisation-argo-cd-sans-attendre)).

**Si le rollout reste bloqué en `Insufficient cpu`** (connu, voir
[06-monitoring.md §6.7](06-monitoring.md#67-effet-de-bord-vécu--capacité-cpu-chroniquement-tendue)) :
```bash
kubectl -n hr get rs
kubectl -n hr scale rs <ancien-replicaset> --replicas=0
```

## 9.2 Après une modification de manifeste Kubernetes (`infra/k8s/**`)

Même flux GitOps que 9.1, sans étape CI (pas de build d'image à faire) :
```bash
git add infra/k8s
git commit -m "..."
git push origin main
```

Pour relire le rendu Kustomize **avant** de pousser un changement risqué (recommandé) :
```bash
kubectl kustomize infra/k8s/overlays/prod
```

⚠️ Éviter `kubectl apply -k infra/k8s/overlays/prod` en usage courant : ça fonctionne, mais
Argo CD considère alors le cluster comme **divergent** de Git et écrasera ce changement au
prochain sync s'il n'a pas aussi été commité. À réserver au dépannage ponctuel.

**Si le changement touche un ConfigMap** (`configmap.yaml` ou `patch-configmap.yaml`) : les
pods déjà démarrés ne relisent pas leurs variables d'environnement tout seuls (`envFrom` est
lu une seule fois, au démarrage du conteneur) :
```bash
kubectl -n hr rollout restart deployment/hr-backend
```
(vécu avec le bug CORS après la migration de domaine - le nouveau `CORS_ALLOWED_ORIGINS`
était bien dans le ConfigMap mais le pod tournait encore avec l'ancien).

## 9.3 Après une modification Terraform (`infra/terraform/**`)

Jamais automatique - volontairement manuel, voir [02-terraform-gke.md §2.4](02-terraform-gke.md#24-init--plan--apply) :
```bash
cd infra/terraform
terraform plan -out=tfplan
terraform apply tfplan
```
- `terraform init -backend-config backend.hcl` seulement si jamais fait sur cette machine.
- Toujours relire le plan avant `apply` : un `-/+` signifie destroy+recreate (ex :
  `workload_identity_config` a nécessité une recréation du node pool, ~6 min d'indisponibilité).
- PowerShell : `-backend-config backend.hcl` avec un espace, jamais
  `-backend-config=backend.hcl` (erreur trompeuse "Too many command line arguments").

## 9.4 Après une modification d'un secret applicatif

Reprendre [03-secrets.md §3.2-3.3](03-secrets.md#32-générer-le-secret-en-clair-localement-jamais-appliqué-tel-quel) :
```bash
kubectl create secret generic hr-backend-secrets --namespace hr \
  --from-literal=CLE=valeur ... \
  --dry-run=client -o yaml > hr-backend-secrets.plain.yaml

kubeseal --format=yaml --controller-namespace=kube-system \
  < hr-backend-secrets.plain.yaml > infra/k8s/overlays/prod/sealed-secret.yaml

rm hr-backend-secrets.plain.yaml
git add infra/k8s/overlays/prod/sealed-secret.yaml
git commit -m "..." && git push origin main
```

Puis, **toujours**, forcer le redémarrage (un Secret modifié n'est pas rechargé tout seul) :
```bash
kubectl -n hr rollout restart deployment/hr-backend
```

⚠️ Lancer `kubeseal` depuis **Bash**, pas PowerShell : la redirection `>` de PowerShell 5.1
écrit en UTF-16 avec BOM par défaut, ce qui corrompt le YAML généré.

## 9.5 Résumé rapide

| Type de changement | Commande(s) principale(s) | Redéploiement automatique ? |
|---|---|---|
| Code backend/frontend | `git push` | Oui (CI build+push+bump, puis Argo CD) |
| Manifeste K8s (`infra/k8s/**`) | `git push` | Oui (Argo CD directement, pas de CI) |
| ConfigMap | `git push` + `rollout restart` | Partiel - le contenu se synchronise seul, le pod doit être redémarré à la main |
| Terraform (`infra/terraform/**`) | `terraform apply` | Non - jamais automatique |
| Secret applicatif | kubeseal + `git push` + `rollout restart` | Partiel - même raison que le ConfigMap |

## 9.6 Extinction / démarrage du cluster (routine budget)

Procédure complète et explication détaillée : [02-terraform-gke.md §2.6](02-terraform-gke.md#26-discipline-budget--redimensionner-le-node-pool-entre-deux-sessions).
Résumé pour un usage quotidien :

**Fin de session :**
```bash
gcloud container clusters resize hrapp-gke --node-pool=system \
  --num-nodes=0 --zone=europe-west1-b --project=hrapp-471203 --quiet
gcloud sql instances patch hrapp-mysql --activation-policy=NEVER --project=hrapp-471203 --quiet
```

**Reprise de session :**
```bash
gcloud container clusters resize hrapp-gke --node-pool=system \
  --num-nodes=1 --zone=europe-west1-b --project=hrapp-471203 --quiet
gcloud sql instances patch hrapp-mysql --activation-policy=ALWAYS --project=hrapp-471203 --quiet
gcloud container clusters get-credentials hrapp-gke --zone=europe-west1-b --project=hrapp-471203
```
Compter 2-3 minutes après le resize pour que tous les pods (backend, frontend, Ollama, Argo
CD, monitoring) soient replanifiés et `Running` - aucune action manuelle nécessaire, c'est le
scheduler Kubernetes qui s'en charge.

### Vérifier l'état réel (avant de déclarer "c'est éteint" ou "c'est prêt")

```bash
kubectl get nodes
# vide = 0 nœud actif ; 1 ligne "Ready" = le nœud est bien remonté

gcloud sql instances describe hrapp-mysql --project=hrapp-471203 --format="value(state)"
# STOPPED ou RUNNABLE

gcloud container clusters describe hrapp-gke --zone=europe-west1-b --project=hrapp-471203 \
  --format="value(currentNodeCount)"
```

**Utilité de `currentNodeCount`** : c'est le champ qui reflète le nombre de nœuds **réellement
actifs à cet instant**. Piège rencontré en pratique : `gcloud container node-pools describe
system ... --format="value(initialNodeCount)"` donne l'impression de répondre à la même
question mais renvoie en fait la taille du pool **à sa création** (toujours `1`, quelle que
soit la taille actuelle après un `resize`) - une commande qui semble juste mais ment. Pour
une vérification fiable, utiliser `currentNodeCount` (sur la ressource **cluster**, pas
node-pool) ou, plus simplement, `kubectl get nodes` une fois authentifié sur le cluster.
