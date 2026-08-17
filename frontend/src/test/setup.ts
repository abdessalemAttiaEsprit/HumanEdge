import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// `test.globals` n'est pas activé (imports explicites de vitest partout) : le cleanup
// automatique de @testing-library/react ne s'enregistre donc pas tout seul, il faut le
// brancher ici pour éviter que le DOM d'un test précédent ne pollue le suivant.
afterEach(() => {
  cleanup();
});
