# 1. Containerisation

## Builder et tester le backend en local

```bash
cd backend
docker build -t hr-backend:local .
docker run --rm -p 8081:8081 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e DB_URL="jdbc:mysql://host.docker.internal:3306/Hr?useSSL=false&serverTimezone=UTC" \
  -e DB_USERNAME=root \
  -e DB_PASSWORD= \
  -e JWT_SECRET="un-secret-de-test-assez-long" \
  -e CORS_ALLOWED_ORIGINS="http://localhost:5173" \
  hr-backend:local
```

Dans un autre terminal :

```bash
curl http://localhost:8081/actuator/health
# {"status":"UP"}
curl http://localhost:8081/actuator/prometheus | head
# doit renvoyer du texte au format Prometheus (jvm_..., http_server_...)
```

## Builder et tester le frontend en local

```bash
cd frontend
 docker  build -t hr-frontend:local --build-arg VITE_API_BASE_URL=http://localhost:8081 .
docker run --rm -p 8080:80 hr-frontend:local
```

Ouvrir `http://localhost:8080` - la SPA doit se charger, et les routes clientes (ex:
rafraîchir la page sur une route interne) doivent fonctionner grâce au fallback nginx.

## Test d'intégration local (backend + MySQL + frontend)

Crée un fichier `docker-compose.yml` temporaire à la racine (non commité, juste pour ce
test) :

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: Hr
    ports: ["3306:3306"]
  backend:
    build: ./backend
    environment:
      SPRING_PROFILES_ACTIVE: prod
      DB_URL: jdbc:mysql://mysql:3306/Hr?useSSL=false&serverTimezone=UTC
      DB_USERNAME: root
      DB_PASSWORD: root
      JWT_SECRET: un-secret-de-test-assez-long
      CORS_ALLOWED_ORIGINS: http://localhost:8080
    ports: ["8081:8081"]
    depends_on: [mysql]
  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: http://localhost:8081
    ports: ["8080:80"]
    depends_on: [backend]
```

```bash
docker compose up --build
# tester http://localhost:8080 dans le navigateur, se connecter avec admin@esprit.tn/admin
docker compose down -v
```

## Premier push manuel vers Docker Hub

> ⚠️ **Piège réel rencontré en prod** : `hr-frontend:local` (buildé plus haut avec
> `VITE_API_BASE_URL=http://localhost:8081` pour les tests locaux) ne doit **jamais** être
> retaggé tel quel comme image de prod - `VITE_API_BASE_URL` est une variable **build-time**
> Vite, gravée en dur dans les fichiers JS générés (contrairement à une variable d'env
> classique, elle n'est pas relisible/modifiable au runtime du conteneur). La retagger
> directement produit un frontend qui appelle `http://localhost:8081` depuis le navigateur
> de n'importe quel visiteur - exactement le bug qui est arrivé ici avant que ce chapitre ne
> soit corrigé. Le backend n'a pas ce problème (`hr-backend:local` peut être retaggé sans
> risque, sa config est 100% par variables d'env lues au démarrage).

```bash
docker login

# Backend : l'image de test peut être retaggée directement, aucune valeur n'y est gravée en dur.
docker tag hr-backend:local docker.io/<TON_USER_DOCKERHUB>/hr-backend:latest
docker push docker.io/<TON_USER_DOCKERHUB>/hr-backend:latest

# Frontend : reconstruire avec la VRAIE URL publique de l'API, jamais retagger hr-frontend:local.
docker build -t docker.io/<TON_USER_DOCKERHUB>/hr-frontend:latest \
  --build-arg VITE_API_BASE_URL=https://api.<TON_DOMAINE> \
  ./frontend
docker push docker.io/<TON_USER_DOCKERHUB>/hr-frontend:latest
```

Vérifie sur `https://hub.docker.com/r/<TON_USER_DOCKERHUB>/hr-backend` que le dépôt est bien
**public** (Settings > Visibility) pour éviter tout `imagePullSecret` côté cluster.

Ensuite seulement, remplace `<TON_USER_DOCKERHUB>` dans :
- `infra/k8s/overlays/prod/kustomization.yaml`
- `infra/k8s/overlays/dev/kustomization.yaml`
- `infra/argocd/applications/backend-frontend.yaml` et `infra/argocd/app-of-apps.yaml`
  (remplace aussi `<TON_USER_GITHUB>` par ton compte/organisation GitHub)

> Une fois la CI en place ([05-cicd-github-actions.md](05-cicd-github-actions.md)), ce push
> manuel ne sert plus qu'au tout premier déploiement : chaque commit ultérieur reconstruit
> automatiquement le frontend avec la bonne `VITE_API_BASE_URL` (Variable GitHub Actions),
> donc ce piège ne peut plus se reproduire une fois la CI branchée.