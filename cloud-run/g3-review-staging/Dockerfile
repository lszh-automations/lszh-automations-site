# Only synthetic private-transport canary. No third-party packages.
# SHA digest must be pinned and approved before any deployment.
FROM node:22-alpine
WORKDIR /srv
COPY --chown=node:node index.mjs /srv/index.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node","/srv/index.mjs"]
