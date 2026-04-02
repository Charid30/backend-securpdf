FROM node:22-slim

RUN apt-get update && apt-get install -y qpdf --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
