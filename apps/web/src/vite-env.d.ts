/// <reference types="vite/client" />

import type { CompanionApi } from './api';

declare global {
  interface Window {
    ncaa?: CompanionApi;
  }
}
