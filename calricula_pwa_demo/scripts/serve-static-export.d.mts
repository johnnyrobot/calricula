import type { Server } from "node:http";

export const STATIC_EXPORT_CSP: string;
export function startStaticExportServer(port: number): Promise<Server>;
