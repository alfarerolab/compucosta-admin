// shared/socketConfig.ts
export const SOCKET_URL = process.env.NODE_ENV === "production"
  ? "https://admin.compucosta.com"
  : "http://localhost:3001";
