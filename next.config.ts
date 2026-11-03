import type { NextConfig } from 'next';
import dotenv from 'dotenv';

// Carrega .env/.env.local apenas em desenvolvimento. `override: false` garante
// que variáveis definidas pela plataforma (Vercel/CI) tenham prioridade — o
// arquivo local nunca sobrescreve o ambiente de produção.
dotenv.config({ path: ['.env.local', '.env'], override: false, quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    PROJECT_ID: process.env.HAPPYSEEDS_PROJECT_ID ?? '',
    REACTUS_BASE_URL: process.env.REACTUS_BASE_URL ?? '',
  },
  serverExternalPackages: [],
  allowedDevOrigins: [
    '**.*.*',
  ],
};

export default nextConfig;
