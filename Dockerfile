# teraplayz Dockerfile
# Language: Dockerfile | Runtime: Node 20 | Target: Koyeb / any container
# Gotcha: free tier has low memory; keep node_modules lean. Telegram file URLs still expire.

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
