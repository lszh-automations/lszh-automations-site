# Synthetic private Canary: no production or customer APIs.
# Base must be SHA-pinned. Offline deterministic npm/corepack removal only.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /srv
# Canary only needs node itself. npm/corepack contain avoidable transitive CVEs.
# Exact remove-only command is independently whitelisted by image-plan audit.
RUN test -d /usr/local/lib/node_modules/npm && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --chown=node:node index.mjs /srv/index.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node","/srv/index.mjs"]
