# Frontend (Vite). One image powers the dev server, the e2e web target, and the
# web unit tests — the compose service just overrides the command.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# default: dev server (compose overrides host/port + VITE_API_BASE)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
