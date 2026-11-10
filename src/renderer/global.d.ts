import type { AppInfo } from '../shared/types';

export {};

declare global {
  interface Window {
    mindtraveller: {
      getAppInfo(): Promise<AppInfo>;
      quit(): Promise<void>;
    };
  }
}
