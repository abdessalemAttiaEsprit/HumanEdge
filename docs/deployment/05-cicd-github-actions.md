# 5. CI/CD (GitHub Actions → Docker Hub → GitOps)

Aucun credential cloud (GCP ou autre) dans GitHub Actions : la CI pousse l'image sur Docker
Hub, puis commit un bump de tag dans `infra/k8s/overlays/prod/kustomization.yaml`. Argo CD
(dans le cluster) détecte ce commit et synchronise seul - la CI ne parle jamais directement
à GKE.

## 5.1 Créer un token d'accès Docker Hub

Docker Hub > Account Settings > Security > **New Access Token**, scope `Read & Write`.
Note le token immédiatement (non ré-affichable).

## 5.2 Configurer le repo GitHub

Repo GitHub > Settings > Secrets and variables > Actions :

**Secrets** (onglet "Secrets") :
| Nom | Valeur |
|---|---|
| `DOCKERHUB_USERNAME` | ton nom d'utilisateur Docker Hub |
| `DOCKERHUB_TOKEN` | le token créé à l'étape 5.1 |

**Variables** (onglet "Variables", pas un secret - c'est juste une URL publique) :
| Nom | Valeur |
|---|---|
| `VITE_API_BASE_URL` | `https://api.hr.example.com` (ou ton URL nip.io/domaine réel) |

## 5.3 Ce que font les workflows

`.github/workflows/backend-ci-cd.yml` et `frontend-ci-cd.yml` se déclenchent sur push sur
`main` touchant respectivement `backend/**` ou `frontend/**` :

1. `build-test-push` : tests (`./mvnw test` / `npm run typecheck`), build+push de l'image
   Docker Hub avec deux tags : `<7 premiers caractères du SHA>` et `latest`.
2. `update-gitops-manifest` : `kustomize edit set image` dans
   `infra/k8s/overlays/prod/kustomization.yaml` pour pointer vers le tag SHA qui vient
   d'être poussé, puis commit + push sur `main` avec le compte `github-actions[bot]`.

Argo CD (sync automatique configuré en étape 4) applique ce nouveau commit en général sous
3 minutes (intervalle de polling par défaut), ou immédiatement via un webhook GitHub→Argo CD
(non couvert ici, à ajouter plus tard si besoin d'un déploiement instantané).

## 5.4 Premier déclenchement

```bash
git add backend frontend .github infra docs
git commit -m "ci: infra de déploiement GKE"
git push origin main
```
- `git add` : stage explicitement les dossiers concernés par ce commit (jamais `git add -A`
  à l'aveugle - évite d'inclure par erreur un fichier généré ou un secret local comme
  `terraform.tfvars`, déjà exclu par `.gitignore` mais mieux vaut rester explicite).
- `git commit -m` : crée le commit avec un message court décrivant le changement.
- `git push origin main` : envoie le commit vers `main` sur le remote `origin` - c'est ce
  push précis qui **déclenche** les deux workflows GitHub Actions (`on: push: branches:
  [main]` dans leurs fichiers YAML).

Onglet **Actions** du repo GitHub → les deux workflows doivent se lancer et passer au vert.
Vérifie ensuite le commit automatique de bump de tag :

```bash
git pull
git log --oneline -5
# doit contenir "chore(gitops): bump hr-backend image to <sha>" et pareil pour hr-frontend
```
- `git pull` : récupère le commit que `update-gitops-manifest` (étape 5.3) vient de pousser
  automatiquement sur `main` pendant que le workflow tournait - ton dépôt local est
  désormais un commit "en retard" par rapport à `origin/main` tant que tu ne pull pas.
- `git log --oneline -5` : affiche les 5 derniers commits sur une ligne chacun, pour
  repérer rapidement le commit auto généré par `github-actions[bot]`.

## 5.5 Forcer une synchronisation Argo CD sans attendre

```bash
argocd app sync hr-app
# ou dans l'UI Argo CD (kubectl -n argocd port-forward svc/argocd-server 8080:443)
```
- `argocd app sync hr-app` : CLI Argo CD (à installer séparément), force immédiatement la
  réconciliation de l'Application `hr-app` avec l'état Git actuel, sans attendre le
  polling automatique de 3 minutes.
- Alternative sans installer la CLI : `kubectl -n argocd port-forward svc/argocd-server
  8080:443` ouvre un tunnel vers l'UI web d'Argo CD (`https://localhost:8080`), où le
  bouton "Sync" fait la même chose.

## Dépannage

- **Le job `update-gitops-manifest` échoue au `git push` (403)** : Settings > Actions >
  General > "Workflow permissions" doit autoriser "Read and write permissions" au niveau
  du repo (le `permissions: contents: write` du workflow prime normalement, mais certains
  réglages d'organisation peuvent quand même bloquer - à vérifier en premier).
- **L'image ne change pas côté cluster** : vérifie que `infra/k8s/overlays/prod/kustomization.yaml`
  contient bien le nouveau tag après le commit auto, et que `argocd app get hr-app` affiche
  `Synced`/`Healthy` (sinon `argocd app sync hr-app` puis regarder les events du pod).
