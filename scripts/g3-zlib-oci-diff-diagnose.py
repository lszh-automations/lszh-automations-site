#!/usr/bin/env python3
"""Read-only OCI comparison. Prints differing paths + hashes, NEVER file contents."""
import hashlib
import io
import json
import sys
import tarfile
from pathlib import Path

def sha(buf):
    return hashlib.sha256(buf).hexdigest()

def collect(file):
    with tarfile.open(file, "r:*") as archive:
        files = {m.name: m for m in archive if m.isfile()}
        if "index.json" not in files:
            raise ValueError("missing OCI index")
        idx = json.load(archive.extractfile(files["index.json"]))
        if len(idx.get("manifests", [])) != 1:
            raise ValueError("one OCI manifest required")
        root_digest = idx["manifests"][0]["digest"]
        def blob(d):
            if not d.startswith("sha256:") or len(d) != 71:
                raise ValueError("invalid blob")
            return archive.extractfile(files["blobs/sha256/"+d[7:]]).read()
        manifest = json.loads(blob(root_digest))
        config = json.loads(blob(manifest["config"]["digest"]))
        layers = manifest["layers"]
        paths = {}
        for layer in layers:
            data = blob(layer["digest"])
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as inner:
                for m in inner:
                    name = m.name.removeprefix("./")
                    if not name:
                        continue
                    paths[name] = {
                        "type": m.type.decode(errors="replace"),
                        "mtime": m.mtime,
                        "size": m.size,
                        "uid": m.uid,
                        "gid": m.gid,
                        "mode": m.mode,
                        "sha256": sha(inner.extractfile(m).read()) if m.isfile() else None
                    }
        return {
            "manifest": root_digest,
            "config_digest": manifest["config"]["digest"],
            "diff_ids": config.get("rootfs", {}).get("diff_ids", []),
            "history": [x.get("created_by", "")[:100] for x in config.get("history", [])],
            "paths": paths
        }

def main():
    if len(sys.argv) != 3:
        raise ValueError("expected two local OCI tar files")
    a, b = (collect(Path(f)) for f in sys.argv[1:])
    all_names = sorted(set(a["paths"]) | set(b["paths"]))
    differences = []
    for name in all_names:
        if a["paths"].get(name) != b["paths"].get(name):
            differences.append({
                "path": name[:300],
                "first": a["paths"].get(name),
                "second": b["paths"].get(name)
            })
    print(json.dumps({
        "kind": "OCI_REPRODUCIBILITY_DIAGNOSIS_ONLY",
        "releaseStatus": "NO_GO", "canPublish": False, "canDeploy": False,
        "manifestsEqual": a["manifest"] == b["manifest"],
        "configsEqual": a["config_digest"] == b["config_digest"],
        "layerDiffIdsEqual": a["diff_ids"] == b["diff_ids"],
        "diffPathCount": len(differences),
        "differences": differences[:15]
    }, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, KeyError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "BLOCKED_OCI_DIAGNOSIS", "releaseStatus": "NO_GO"}))
        sys.exit(2)
