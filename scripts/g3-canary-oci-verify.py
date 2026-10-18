#!/usr/bin/env python3
"""Verify SHA-256 of every OCI blob and compare two offline candidate builds.

No remote registry access, upload, Docker daemon, cloud credentials, or GCP writes.
OCI index/image digest != future Artifact Registry manifest digest until pushed
and read back. Output is a CANDIDATE report only, never a release approval.
"""
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

DIGEST = re.compile(r"^sha256:([a-f0-9]{64})$")
BLOB = re.compile(r"^blobs/sha256/[a-f0-9]{64}$")
MAX_META = 1024 * 1024


def require(ok, message):
    if not ok:
        raise ValueError(message)


def load_json(blob):
    require(len(blob) <= MAX_META, "metadata too large")
    return json.loads(blob)


def verify(path):
    with tarfile.open(path, mode="r:*") as archive:
        members = {}
        for member in archive.getmembers():
            if member.isdir():
                continue
            require(member.isfile(), "nonregular OCI archive entry")
            require(member.name in ("index.json", "oci-layout") or
                    BLOB.fullmatch(member.name), "unexpected OCI archive entry")
            require(member.name not in members, "duplicate OCI archive entry")
            members[member.name] = member
        require("index.json" in members and "oci-layout" in members,
                "missing OCI metadata")
        layout = load_json(archive.extractfile(members["oci-layout"]).read())
        require(layout == {"imageLayoutVersion": "1.0.0"}, "invalid OCI layout")
        verified = {}
        for name, member in members.items():
            if not name.startswith("blobs/"):
                continue
            digest = hashlib.sha256()
            fileobj = archive.extractfile(member)
            for chunk in iter(lambda: fileobj.read(1024 * 1024), b""):
                digest.update(chunk)
            actual = digest.hexdigest()
            require(actual == name.split("/")[-1], "OCI blob SHA mismatch")
            verified[name] = member.size

        def blob(digest):
            match = DIGEST.fullmatch(str(digest))
            require(match is not None, "invalid descriptor SHA")
            name = "blobs/sha256/" + match.group(1)
            require(name in verified, "missing referenced SHA blob")
            data = archive.extractfile(members[name]).read()
            require(len(data) <= MAX_META, "metadata blob too large")
            return load_json(data)

        idx = load_json(archive.extractfile(members["index.json"]).read())
        descriptors = idx.get("manifests")
        require(isinstance(descriptors, list) and len(descriptors) == 1,
                "expected exactly one image manifest (no attestations)")
        desc = descriptors[0]
        require(desc.get("mediaType") ==
                "application/vnd.oci.image.manifest.v1+json",
                "expected OCI image manifest")
        manifest = blob(desc.get("digest"))
        require(manifest.get("schemaVersion") == 2, "wrong image schema")
        config_desc = manifest.get("config", {})
        require(config_desc.get("mediaType") ==
                "application/vnd.oci.image.config.v1+json", "wrong config type")
        config = blob(config_desc.get("digest"))
        require(config.get("architecture") == "amd64" and
                config.get("os") == "linux", "unexpected runtime architecture")
        container = config.get("config", {})
        require(container.get("User") == "node", "container runs as root")
        require(container.get("Cmd") == ["node", "/srv/index.mjs"],
                "unexpected container entrypoint")
        layers = manifest.get("layers")
        require(isinstance(layers, list) and layers, "missing image layers")
        for layer in layers:
            require(layer.get("mediaType") in
                    ("application/vnd.oci.image.layer.v1.tar+gzip",
                     "application/vnd.oci.image.layer.v1.tar",
                     "application/vnd.oci.image.layer.v1.tar+zstd"),
                    "unexpected layer type")
            d = DIGEST.fullmatch(str(layer.get("digest")))
            require(d is not None and "blobs/sha256/" + d.group(1) in verified,
                    "missing referenced layer")
        return {"ociManifestDigest": desc["digest"],
                "ociConfigDigest": config_desc["digest"],
                "verifiedBlobs": len(verified)}


def main(argv):
    require(len(argv) == 2, "two candidate OCI tars required")
    a, b = (verify(Path(p)) for p in argv)
    require(a == b, "NOT_REPRODUCIBLE: candidate manifests/config differ")
    return {"status": "CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED",
            "releaseStatus": "NO_GO", "canPublish": False,
            "canDeploy": False, "candidate": a,
            "registryImageDigest": "NOT_CREATED",
            "scanAndProvenance": "NOT_APPROVED"}


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:]), sort_keys=True))
    except (ValueError, OSError, tarfile.TarError, json.JSONDecodeError):
        print(json.dumps({"status": "BLOCKED_INVALID_OR_DIFFERING_OCI",
                          "releaseStatus": "NO_GO"}))
        sys.exit(2)
