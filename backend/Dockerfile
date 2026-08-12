FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma/
# Generate Prisma Client
RUN npx prisma generate

COPY . .

EXPOSE 4000

# Wait for DB to be up and run migrations before starting
CMD ["sh", "-c", "npx prisma db push && npm start"]
