# Worker API. wrangler runs the Worker locally via workerd, which is a glibc
# binary — so use debian-slim, NOT alpine (musl). Powers `wrangler dev` (with a
# Miniflare-simulated R2 bucket) and the api unit tests.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# non-interactive: no update nags, no telemetry, no login prompts in local mode
ENV CI=true
ENV WRANGLER_SEND_METRICS=false
EXPOSE 8787
# default command; compose overrides it to inject the local Redis/JWT vars
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
