FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --frozen-lockfile --prefer-offline

COPY . .

RUN pnpm run build

ENV NODE_ENV=production
ENV JWT_SECRET=sickpunt_jwt_fallback_x9k2mPqR7vLnW4sT8uY3zA6bE1cF5gH0jK
ENV DATABASE_URL=mysql://root:qVLHGRMlnylNCHJBoOoViOBEHuLNVHfn@hopper.proxy.rlwy.net:14072/railway
ENV GOOGLE_REDIRECT_URI=https://sickpunt-app-production.up.railway.app/api/oauth/callback

CMD ["pnpm", "start"]
