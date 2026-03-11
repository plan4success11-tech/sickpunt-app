FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --frozen-lockfile --prefer-offline

COPY . .

RUN pnpm run build

# Non-sensitive defaults — secrets are set via environment variables in Render/Railway dashboard
ENV NODE_ENV=production
ENV VITE_APP_ID=sickpunt
ENV BUILT_IN_FORGE_API_URL=https://api.groq.com/openai
ENV ENABLE_IMPERIAL_INGESTION=true

CMD ["pnpm", "start"]
