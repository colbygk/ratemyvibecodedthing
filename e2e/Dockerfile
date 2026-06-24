# End-to-end runner. Start from a plain node image and let `playwright install`
# pull the browser that matches whatever @playwright/test version resolves — that
# avoids pinning a base-image tag to an exact Playwright version.
FROM node:20-bookworm
WORKDIR /e2e
COPY package.json ./
RUN npm install
RUN npx playwright install --with-deps chromium
COPY . .
CMD ["npx", "playwright", "test"]
