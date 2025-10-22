# Frontend Dockerfile (optional for container hosting instead of GitHub Pages)
# Build: docker build -t poe-flip-frontend:latest -f frontend/Dockerfile .
# Run: docker run -p 5173:80 poe-flip-frontend:latest
# If deploying via GitHub Pages you don't need this file.

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend ./
RUN npm run build

# nginx serve static build
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Remove default config and add minimal cache headers if needed
EXPOSE 80

# (Optional) custom nginx config could be added here if you need SPA routing.
