import { test as base } from "@playwright/test";

import {
  attachLegacyNetworkGuard,
  type LegacyNetworkGuard,
} from "./helpers";

type CalriculaFixtures = {
  legacyNetworkGuard: LegacyNetworkGuard;
};

export const test = base.extend<CalriculaFixtures>({
  legacyNetworkGuard: [
    async ({ page }, use) => {
      const guard = attachLegacyNetworkGuard(page);
      await use(guard);
      guard.assertClean();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
