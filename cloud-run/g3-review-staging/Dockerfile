# G3 synthetic-only private Cloud Run receiver.
# Build must supply a digest-pinned, independently reviewed base image.
# No default base image: accidental floating-tag builds fail closed.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /srv
COPY --chown=node:node index.mjs /srv/index.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node","/srv/index.mjs"]
