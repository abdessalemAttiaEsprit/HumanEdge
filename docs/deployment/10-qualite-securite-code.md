# 10. Qualité de code & sécurité (SonarQube, Snyk, Trivy)

> **Statut : implémenté, en mode "rapport seul" (semaine 1 de la stratégie §10.5).** Trivy
> (image + IaC) tourne sur chaque push sans rien exiger de plus - les résultats apparaissent
> dans l'onglet **Security** du repo GitHub. SonarCloud et Snyk sont câblés dans les 3
> workflows (`backend-ci-cd.yml`/`frontend-ci-cd.yml`/`security-scan.yml`) mais échouent
> sans effet de bord (`continue-on-error: true`) tant que les comptes et tokens décrits en
> 10.2/10.3 n'ont pas été créés - rien à modifier dans le code une fois les secrets GitHub
> ajoutés, les steps réussissent automatiquement au push suivant.
>
> ⚠️ **Piège rencontré à l'implémentation** : la première version gardait ces steps
> derrière `if: ${{ secrets.SONAR_TOKEN != '' }}` pour un rendu "skipped" plus propre dans
> l'UI GitHub tant que le token n'existe pas - mais `secrets` n'est **pas** une context
> utilisable dans un `if:` (erreur `Unrecognized named-value: 'secrets'`), ce qui a fait
> échouer les 3 workflows au démarrage (0 job exécuté, aucun rapport à l'onglet Actions).
> Retiré partout ; `continue-on-error: true` (déjà nécessaire de toute façon pour le mode
> rapport, §10.5) suffit à obtenir le même résultat fonctionnel, au prix d'un badge "failed"
> au lieu de "skipped" tant que le secret n'est pas ajouté.

## 10.0 Pourquoi ces 3 outils, et pourquoi pas un seul

Ils couvrent 3 questions différentes, pas la même chose sous 3 marques :

| Outil | Question à laquelle il répond | Analyse |
|---|---|---|
| **SonarQube** (SonarCloud) | Le code est-il maintenable/testé/propre ? | Qualité statique : bugs potentiels, code smells, duplication, couverture de tests |
| **Trivy** | L'image Docker ou les manifestes IaC ont-ils des vulnérabilités/misconfigurations connues ? | Scan de vulnérabilités (CVE) + scan de configuration (Dockerfile, K8s, Terraform) |
| **Snyk** | Les dépendances (Maven/npm) et l'IaC ont-ils des vulnérabilités, avec un correctif suggéré ? | Scan de dépendances + IaC, avec tableau de bord web et suggestions de fix |

Trivy et Snyk se recoupent partiellement (scan d'image, scan IaC) - ce n'est pas une
redondance à éliminer mais une garde à deux niveaux : Trivy est gratuit/illimité/sans compte
et donc adapté à un usage **bloquant** en CI (fail le build), Snyk apporte un tableau de bord
persistant et des suggestions de correctif plus riches mais avec un quota gratuit limité,
donc mieux adapté à une revue **périodique** plutôt qu'à chaque commit.

## 10.1 Trivy — à implémenter en premier (gratuit, sans compte, sans token)

[Trivy](https://github.com/aquasecurity/trivy) (Aqua Security) est open source, ne nécessite
aucune inscription ni secret GitHub, et scanne 3 choses utiles ici :

1. **Images Docker** (`hr-backend`, `hr-frontend`) juste après le build, avant le push.
2. **Manifestes Kubernetes** (`infra/k8s/**`) - misconfigurations (ex : conteneur qui tourne
   en root, absence de `resources.limits`, `hostNetwork` activé...).
3. **Terraform** (`infra/terraform/**`) - misconfigurations (ex : c'est ce type de scan qui
   aurait détecté l'accès public `0.0.0.0/0` sur Cloud SQL avant qu'il ne soit corrigé
   manuellement, voir [07-checklist-securite-budget.md](07-checklist-securite-budget.md)).

Intégration réelle (`aquasecurity/trivy-action`) : étape ajoutée dans `build-test-push` de
`backend-ci-cd.yml`/`frontend-ci-cd.yml`, juste après le push de l'image (scan après coup,
pas avant - plus simple à brancher sur un pipeline existant sans le restructurer ; à
resserrer plus tard en "scan avant push" si on passe en mode bloquant, voir §10.5) :

```yaml
      - name: Trivy (scan de l'image)
        uses: aquasecurity/trivy-action@v0.32.0
        with:
          image-ref: ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
          format: sarif
          output: trivy-image-results.sarif
          severity: CRITICAL,HIGH
          exit-code: '0'   # mode rapport - voir §10.5 sur le passage progressif en bloquant

      - name: Trivy - publier les résultats dans l'onglet Security
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-image-results.sarif
          category: trivy-image-backend   # trivy-image-frontend dans l'autre workflow
```

Le job `build-test-push` a aussi reçu `permissions: security-events: write` (requis pour
que `upload-sarif` puisse écrire dans l'onglet Security).

Scan IaC (Terraform + Kubernetes) : nouveau workflow dédié
`.github/workflows/security-scan.yml`, déclenché sur push touchant `infra/**` (indépendant
des workflows backend/frontend, pas besoin de builder une image pour ce scan) :

```yaml
  scan-iac:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - name: Trivy (config Terraform + Kubernetes)
        uses: aquasecurity/trivy-action@v0.32.0
        with:
          scan-type: config
          scan-ref: infra
          format: sarif
          output: trivy-iac-results.sarif
          severity: CRITICAL,HIGH
          exit-code: '0'
      - name: Trivy - publier les résultats dans l'onglet Security
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-iac-results.sarif
          category: trivy-iac
```

Résultats consultables dans l'onglet **Security > Code scanning** du repo GitHub, sans rien
configurer de plus - `exit-code: '0'` partout pour l'instant (mode rapport, §10.5).

## 10.2 SonarQube (via SonarCloud, pas d'hébergement à gérer)

Le repo GitHub (`HumanEdge`) est déjà **public** (nécessaire pour Argo CD, voir le
récapitulatif). [SonarCloud](https://sonarcloud.io) est **gratuit pour les repos publics** -
pas besoin d'auto-héberger un serveur SonarQube (qui coûterait de la RAM sur le nœud GKE déjà
sous tension, voir [06-monitoring.md §6.7](06-monitoring.md#67-effet-de-bord-vécu--capacité-cpu-chroniquement-tendue)).

Le code est déjà en place (`jacoco-maven-plugin` dans `backend/pom.xml`, propriétés
`sonar.projectKey`/`sonar.organization` avec des placeholders `TON_ORG_SONARCLOUD` à
remplacer, `frontend/sonar-project.properties` idem, et les steps `SonarCloud` dans
`backend-ci-cd.yml`/`frontend-ci-cd.yml`, protégées par `continue-on-error: true` - elles
échouent proprement (badge "failed" sans bloquer le job) tant que ce secret n'existe pas).
**Ce qui reste à faire côté compte** :

1. Se connecter sur [sonarcloud.io](https://sonarcloud.io) avec le compte GitHub, importer le
   repo `HumanEdge`. SonarCloud propose de créer 1 projet par langage détecté - garder
   **2 projets séparés** (`hr-backend`, `hr-frontend`), pas un seul, vu que Java et TS ont des
   analyseurs et des règles différentes.
2. Noter la clé d'organisation et les clés de projet que SonarCloud affiche à l'import, et
   les reporter dans `backend/pom.xml` (`<sonar.organization>`/`<sonar.projectKey>`) et
   `frontend/sonar-project.properties` à la place de `TON_ORG_SONARCLOUD`.
3. Générer un token (My Account > Security) → secret GitHub `SONAR_TOKEN`
   (Settings > Secrets and variables > Actions, même écran que `DOCKERHUB_TOKEN`).
4. Commit/push les 2 fichiers modifiés à l'étape 2 - le prochain push déclenchera
   automatiquement une analyse réussie une fois `SONAR_TOKEN` présent.

Le "Quality Gate" par défaut de SonarCloud (couverture, duplication, bugs bloquants) peut être
configuré pour ne pas faire échouer la CI dans un premier temps - voir 10.5. Les steps
utilisent déjà `continue-on-error: true` de toute façon, le temps de ce premier tri.

## 10.3 Snyk (compte gratuit, token requis)

[Snyk](https://snyk.io) a un tier gratuit pour projets open source. Couvre les dépendances
(`backend/pom.xml`, `frontend/package.json`) et l'IaC (`infra/terraform/**`).

Le code est déjà en place (steps `Snyk` dans `backend-ci-cd.yml`, `frontend-ci-cd.yml` et
`security-scan.yml`, protégées par `continue-on-error: true` - échouent proprement sans
bloquer le job tant que le secret n'existe pas, voir §10.5). **Ce qui reste à faire côté
compte** :
1. Créer un compte gratuit sur [snyk.io](https://snyk.io) (login GitHub possible), lier le repo.
2. Récupérer le token (Account Settings > API Token) → secret GitHub `SNYK_TOKEN`
   (Settings > Secrets and variables > Actions, même écran que `DOCKERHUB_TOKEN`/`SONAR_TOKEN`).

Rien d'autre à faire : les 3 scans (backend, frontend, Terraform) s'activent automatiquement
au push suivant une fois ce secret présent.

## 10.4 Où ça s'insère dans les workflows existants

Aucun de ces outils ne touche à GCP/GKE (même principe que le reste de la CI, voir
[05-cicd-github-actions.md](05-cicd-github-actions.md) : aucun credential cloud dans GitHub
Actions). Emplacement recommandé :

- **Trivy image scan** + **Snyk dépendances** : nouvelles étapes dans le job existant
  `build-test-push` de `backend-ci-cd.yml`/`frontend-ci-cd.yml`, après les tests et avant le
  push Docker Hub - un échec bloque alors `update-gitops-manifest` (qui `needs:
  build-test-push`), donc empêche une image vulnérable de finir déployée.
- **Trivy config** + **Snyk IaC** + **SonarCloud** : nouveau job séparé (ex `code-quality`,
  indépendant de `build-test-push`, sans `needs` entre eux) - ce sont des analyses de code
  source, pas liées à l'image buildée, pas besoin de bloquer le pipeline principal dessus au
  début (voir stratégie de gate ci-dessous).

## 10.5 Stratégie de gate recommandée (progressive, pas tout bloquant dès le jour 1)

Un projet jamais scanné remonte toujours un grand nombre de findings historiques. Tout rendre
bloquant immédiatement bloquerait la CI en continu sans plus-value (personne ne corrige 40
findings d'un coup). Ordre recommandé :

1. **Semaine 1** : tous les scans en mode rapport seul (`exit-code: '0'` / pas de
   `severity-threshold`), pour avoir une photo de l'état actuel sans bloquer personne.
2. **Semaine 2** : rendre **Trivy image scan** bloquant sur `CRITICAL` uniquement (c'est le
   scan le plus fiable/le moins bruyant, zéro faux positif habituellement sur des CVE connues).
3. **Ensuite** : étendre progressivement (Trivy `HIGH`, puis Snyk dépendances, puis Quality
   Gate SonarCloud) au fur et à mesure que les findings existants sont traités ou explicitement
   ignorés (`.trivyignore`, exclusions Snyk, `sonar-project.properties`).

## 10.6 Secrets GitHub à ajouter (récapitulatif)

| Nom | Origine | Utilisé par |
|---|---|---|
| `SONAR_TOKEN` | sonarcloud.io > My Account > Security | job SonarCloud (backend + frontend) |
| `SNYK_TOKEN` | app.snyk.io > Account Settings > API Token | jobs Snyk (dépendances + IaC) |

(Trivy ne nécessite aucun secret - c'est un des critères qui en fait le premier outil à
brancher.)
