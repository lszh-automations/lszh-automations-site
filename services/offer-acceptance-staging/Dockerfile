# Build from repo root: docker build -f services/offer-acceptance-staging/Dockerfile .
# Before any deployment, pin base to a reviewed immutable digest and scan image.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node services/offer-acceptance-staging/app.js services/offer-acceptance-staging/index.js services/offer-acceptance-staging/offerLinks.js /app/services/offer-acceptance-staging/
COPY --chown=node:node offerte-annehmen/index.html /app/offerte-annehmen/index.html
USER node
EXPOSE 8080
CMD ["node","services/offer-acceptance-staging/index.js"]
