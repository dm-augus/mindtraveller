export {};

declare global {
  interface Window {
    mindtraveller: {
      getAppInfo(): Promise<{ version: string }>;
      quit(): Promise<void>;
    };
  }
}
