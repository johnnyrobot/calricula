# ===========================================
# Calricula Frontend - Next.js Dockerfile
# ===========================================

FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching (.npmrc only maps the
# @johnnyrobot scope to GitHub Packages; it holds no credentials)
COPY package.json package-lock.json* .npmrc ./

# `@johnnyrobot/workspace-ui` comes from GitHub Packages and needs a
# `read:packages` token at install time, passed as a BuildKit secret and never
# stored in the image (see docs/APPLICATIONX-EMBED.md).
RUN --mount=type=secret,id=npm_token sh -c ' \
    test -s /run/secrets/npm_token || { echo "npm_token secret missing: pass --secret id=npm_token,src=<file> (read:packages token)" >&2; exit 1; }; \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" > ~/.npmrc && \
    npm install; status=$?; rm -f ~/.npmrc; exit $status'

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Run the development server
CMD ["npm", "run", "dev"]
