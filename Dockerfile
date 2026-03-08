FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --frozen-lockfile --prefer-offline

COPY . .

RUN pnpm run build

ENV NODE_ENV=production

CMD ["pnpm", "start"]
