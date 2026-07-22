# 3. Secrets (Sealed Secrets)

Les secrets applicatifs ne sont **jamais** commités en clair. On utilise
[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) : le secret est chiffré
localement avec `kubeseal`, seul le ciphertext (`SealedSecret`) part dans Git ; seul le
contrôleur installé dans le cluster peut le déchiffrer. Cette étape est **indépendante du
cloud** (GCP ou Azure) - uniquement Kubernetes.

## 3.1 Installer le contrôleur dans le cluster

```bash
  helm repo add sealed-secrets https://bitnami.github.io/sealed-secrets
  helm repo update
  helm install sealed-secrets sealed-secrets/sealed-secrets --namespace kube-system --set-string fullnameOverride=sealed-secrets-controller
```
- `helm repo add` : enregistre localement l'URL du dépôt de charts Helm de Sealed Secrets
  (une seule fois par machine) - Helm ne connaît par défaut aucun dépôt tiers. L'org GitHub
  a été renommée `bitnami-labs` → `bitnami` ; l'ancienne URL renvoie 404.
- `helm repo update` : télécharge l'index à jour de ce dépôt (liste des charts/versions
  disponibles), pour être sûr d'installer la dernière version.
- `helm install sealed-secrets sealed-secrets/sealed-secrets` : installe le chart
  `sealed-secrets` du dépôt `sealed-secrets`, sous le nom de **release** Helm
  `sealed-secrets` (premier argument) - ce nom sert ensuite à cibler la release
  (`helm upgrade`, `helm uninstall`).
- `--namespace kube-system` : déploie le contrôleur dans le namespace système, convention
  du projet Sealed Secrets (il n'est pas propre à l'app `hr`, contrairement au namespace
  `hr` utilisé pour le reste).
- `--set-string fullnameOverride=sealed-secrets-controller` : le chart nomme ses ressources
  `sealed-secrets` par défaut, mais la CLI `kubeseal` cherche par défaut un contrôleur nommé
  `sealed-secrets-controller` - sans ce flag, `kubeseal` ne trouve pas le contrôleur (erreur
  `cannot fetch certificate`) et il faudrait lui passer `--controller-name`/`--controller-namespace`
  à chaque appel.

Installe aussi la CLI `kubeseal` en local (voir lien ci-dessus, correspondance de version
avec le contrôleur recommandée mais pas bloquante pour un usage basique).

## 3.2 Générer le secret en clair (localement, jamais appliqué tel quel)

Reprend les clés attendues dans `infra/k8s/base/secret.example.yaml` :

```bash
kubectl create secret generic hr-backend-secrets \
  --namespace hr \
  --from-literal=DB_URL="jdbc:mysql://<mysql_public_ip>:3306/Hr?useSSL=true&serverTimezone=UTC" \
  --from-literal=DB_USERNAME=hradmin \
  --from-literal=DB_PASSWORD="<le mot de passe TF_VAR_mysql_admin_password choisi en étape 2>" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=MAIL_USERNAME="tonadresse@gmail.com" \
  --from-literal=MAIL_PASSWORD="<mot de passe d'application Gmail, pas le mot de passe du compte>" \
  --dry-run=client -o yaml > hr-backend-secrets.plain.yaml
```

- `kubectl create secret generic hr-backend-secrets` : décrit un objet Kubernetes de type
  `Secret` nommé `hr-backend-secrets` - mais ne l'envoie **pas** au cluster ici (voir
  `--dry-run` ci-dessous).
- `--namespace hr` : le Secret doit vivre dans le même namespace que les pods qui le
  consomment (`hr-backend`) - un Secret n'est lisible que par les pods de son propre
  namespace.
- `--from-literal=CLE=valeur` (répété) : une paire clé/valeur par flag - chaque clé devient
  une entrée du Secret, montée en variable d'env par `infra/k8s/base/backend-deployment.yaml`.
- `<mysql_public_ip>` : la valeur notée à l'étape 2.5 (`terraform output mysql_public_ip`).
- `$(openssl rand -base64 48)` : substitution de commande shell - génère 48 octets
  aléatoires encodés en base64 **à la volée**, différent à chaque exécution ; jamais réutiliser
  un JWT secret d'un autre projet.
- `--dry-run=client -o yaml` : construit l'objet YAML **localement**, sans contacter
  l'API du cluster (`client`) - fonctionne même si le namespace `hr` n'existe pas encore, et
  permet de rediriger le résultat vers un fichier au lieu de l'appliquer directement.
- `> hr-backend-secrets.plain.yaml` : redirection shell standard, écrit le YAML généré dans
  ce fichier local (en clair, jamais commité - voir étape suivante).

Pour `MAIL_PASSWORD`, Gmail exige un
[mot de passe d'application](https://myaccount.google.com/apppasswords) (le compte doit
avoir la validation en 2 étapes activée) - le mot de passe normal du compte Gmail est
refusé par l'API SMTP.

## 3.3 Chiffrer avec kubeseal

```bash
kubeseal --format=yaml --controller-namespace=kube-system < hr-backend-secrets.plain.yaml > infra/k8s/overlays/prod/sealed-secret.yaml
```
- `kubeseal` : contacte le contrôleur Sealed Secrets installé en 3.1 (via l'API Kubernetes,
  pas d'accès réseau direct au pod) pour récupérer sa clé publique, puis chiffre le Secret
  avec cette clé - seul le contrôleur possède la clé privée correspondante.
- `--format=yaml` : produit un objet `SealedSecret` en YAML (plutôt que le format JSON par
  défaut) - cohérent avec le reste des manifestes Kustomize du repo.
- `--controller-namespace=kube-system` : doit correspondre au `--namespace` utilisé en 3.1,
  sinon `kubeseal` ne trouve pas le contrôleur.
- `< hr-backend-secrets.plain.yaml` : redirection d'entrée, lit le fichier généré en 3.2.
- `> infra/k8s/overlays/prod/sealed-secret.yaml` : le résultat chiffré, au bon endroit pour
  être repris par Kustomize (étape 3.4).

```bash
rm hr-backend-secrets.plain.yaml   # ne jamais laisser traîner le fichier en clair
```
- Supprime le fichier intermédiaire en clair de l'étape 3.2 - une fois chiffré, il n'a plus
  d'utilité et représente un risque s'il traîne sur le disque ou dans un historique shell.

`infra/k8s/overlays/prod/sealed-secret.yaml` peut être commité sans risque (contenu
chiffré, seul le contrôleur dans le cluster peut le déchiffrer).

## 3.4 Activer la référence dans l'overlay

Ouvre `infra/k8s/overlays/prod/kustomization.yaml` et ajoute `sealed-secret.yaml` à la
liste `resources:` (la ligne est déjà présente en commentaire) :

```yaml
resources:
  - ../../base
  - sealed-secret.yaml
```
- Kustomize n'applique que les fichiers listés sous `resources:` - sans cette ligne, le
  `SealedSecret` généré en 3.3 existerait sur disque mais ne serait jamais envoyé au
  cluster lors du déploiement GitOps (étape 4).

Répète la même procédure pour `overlays/dev` si tu utilises un cluster local séparé.

## 3.5 Vérifier après déploiement (étape 4)

```bash
kubectl -n hr get secret hr-backend-secrets
kubectl -n hr get sealedsecret hr-backend-secrets -o yaml
```
- Première commande : confirme que le contrôleur a bien **déchiffré** le `SealedSecret` et
  créé le `Secret` Kubernetes standard `hr-backend-secrets` correspondant (c'est ce Secret,
  pas le SealedSecret, que les pods montent réellement).
- Deuxième commande : affiche le `SealedSecret` chiffré tel qu'appliqué au cluster - utile
  pour confirmer que le bon fichier a été synchronisé par Argo CD.

Si le Secret en clair n'apparaît pas, regarde les logs du contrôleur :
`kubectl -n kube-system logs deploy/sealed-secrets-sealed-secrets-controller`.
