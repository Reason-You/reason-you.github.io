import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import numpy as np

import update_light_pollution as lp


def record(record_id=1, year=2024, checksum="md5:old"):
    filename = f"nightlights.average_viirs.v21_m_500m_s_{year}0101_{year}1231_go_epsg4326.tif"
    return {
        "id": record_id,
        "doi": f"10.5281/zenodo.{record_id}",
        "metadata": {"version": f"v{record_id}", "license": {"id": "cc-by-4.0"}},
        "files": [{"key": filename, "checksum": checksum,
                   "links": {"self": f"https://zenodo.org/records/{record_id}/files/{filename}"}}],
    }


class LightPollutionUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.public = self.root / "public" / "light-pollution"
        self.tiles = self.public / "tiles"
        self.tiles.mkdir(parents=True)
        self.meta = self.root / "src" / "lib" / "sky" / "light-pollution-meta.ts"
        self.meta.parent.mkdir(parents=True)
        self.output = self.root / "github-output"
        self.source = self.root / "source.json"
        patches = ExitStack()
        self.addCleanup(patches.close)
        patches.enter_context(patch.multiple(lp, REPO_ROOT=self.root, PUBLIC_DIR=self.public,
                                             TILES_DIR=self.tiles, MANIFEST_PATH=self.public / "manifest.json",
                                             META_TS_PATH=self.meta, CACHE_DIR=self.root / ".cache"))
        patches.enter_context(patch.dict(os.environ, {"GITHUB_OUTPUT": str(self.output)}))
        patches.enter_context(patch.object(lp, "log"))
        _, desired = lp.source_details(record())
        self.manifest = {
            **desired, "datasetName": lp.DATASET_NAME, "conceptDoi": lp.CONCEPT_DOI,
            "license": "cc-by-4.0", "generatedAt": "2026-01-01T00:00:00+00:00",
            "grid": {"topLat": 87.37, "leftLon": -180, "stepDeg": lp.STEP_DEG,
                     "width": 2, "height": 2},
            "tile": {"count": 1, "deg": lp.TILE_DEG, "pixels": lp.TILE_PIXELS},
            "mapping": {"pMax": lp.PROXY_PMAX, "magAtQ0": lp.MAG_AT_Q0,
                        "magAtQ255": lp.MAG_AT_Q255},
        }
        lp.MANIFEST_PATH.write_text(json.dumps(self.manifest))
        (self.tiles / "0_0.png").write_bytes(b"existing tile")

    def outputs(self):
        return dict(line.split("=", 1) for line in self.output.read_text().splitlines())

    def run_main(self, *args):
        with patch.object(sys, "argv", ["update_light_pollution.py", *args]):
            return lp.main()

    def test_resolver_keys_latest_source_not_checked_in_manifest(self):
        newest = record(2, 2025, "md5:new")
        newest["files"].extend(record()["files"])
        with patch.object(lp, "find_latest_record", return_value=newest) as query:
            self.assertEqual(self.run_main("--resolve-source", str(self.source)), 0)
            query.assert_called_once()
        _, desired = lp.source_details(newest)
        self.assertEqual(desired["sourceYear"], 2025)
        self.assertEqual(self.outputs()["cache-key"], lp.cache_key(desired))
        self.assertEqual(self.outputs()["checkout-cache-key"], lp.cache_key(self.manifest))
        self.assertEqual(json.loads(self.source.read_text())["record"], newest)

    def test_unchanged_source_skips_download_and_processing(self):
        self.source.write_text(json.dumps({"record": record()}))
        with patch.object(lp, "find_latest_record") as query, \
             patch.object(lp, "download") as download, patch.object(lp, "load_grid") as load:
            self.assertEqual(self.run_main("--source", str(self.source)), 0)
            query.assert_not_called()
            download.assert_not_called()
            load.assert_not_called()
        self.assertEqual(lp.existing_manifest(), self.manifest)
        self.assertIn(self.manifest["generatedAt"], self.meta.read_text())
        self.assertEqual(self.outputs()["cache-key"], lp.cache_key(self.manifest))

    def test_metadata_outage_keeps_previous_bundle_and_its_key(self):
        with patch.object(lp, "find_latest_record", side_effect=OSError("offline")) as query:
            self.assertEqual(self.run_main("--resolve-source", str(self.source)), 0)
            self.assertEqual(self.outputs()["cache-key"], lp.cache_key(None))
            self.assertEqual(self.run_main("--source", str(self.source)), 0)
            query.assert_called_once()
        self.assertEqual(lp.existing_manifest(), self.manifest)
        self.assertEqual(self.outputs()["cache-key"], lp.cache_key(self.manifest))
        self.assertIn(self.manifest["generatedAt"], self.meta.read_text())

    def test_download_outage_does_not_label_old_data_with_new_key(self):
        newest = record(2, 2025, "md5:new")
        self.source.write_text(json.dumps({"record": newest}))
        with patch.object(lp, "download", side_effect=OSError("offline")), \
             patch.object(lp, "load_grid") as load:
            self.assertEqual(self.run_main("--source", str(self.source)), 0)
            load.assert_not_called()
        _, desired = lp.source_details(newest)
        self.assertEqual(lp.existing_manifest(), self.manifest)
        self.assertEqual(self.outputs()["cache-key"], lp.cache_key(self.manifest))
        self.assertNotEqual(self.outputs()["cache-key"], lp.cache_key(desired))

    def test_same_filename_new_checksum_downloads_new_bytes(self):
        newest = record(checksum="md5:new")
        self.source.write_text(json.dumps({"record": newest}))
        filename = self.manifest["sourceFile"]
        old_path = lp.CACHE_DIR / lp.source_cache_id(self.manifest) / filename
        old_path.parent.mkdir(parents=True)
        old_path.write_bytes(b"old source")
        _, desired = lp.source_details(newest)
        expected = lp.CACHE_DIR / lp.source_cache_id(desired) / filename
        response = io.BytesIO(b"new source")
        response.headers = {"Content-Length": "10"}

        def load_grid(path):
            self.assertEqual(path, expected)
            self.assertEqual(path.read_bytes(), b"new source")
            return np.ones((2, 2), dtype=np.float32), {"topLat": 87.37, "leftLon": -180}

        with patch.object(lp.urllib.request, "urlopen", return_value=response) as fetch, \
             patch.object(lp, "load_grid", side_effect=load_grid), \
             patch.object(lp, "neighbourhood_proxy", side_effect=lambda grid: grid), \
             patch.object(lp, "proxy_to_byte", return_value=np.ones((2, 2), dtype=np.uint8)):
            self.assertEqual(self.run_main("--source", str(self.source)), 0)
            fetch.assert_called_once()
        self.assertEqual(old_path.read_bytes(), b"old source")
        self.assertEqual(lp.existing_manifest()["sourceHash"], "md5:new")
        self.assertEqual(self.outputs()["cache-key"], lp.cache_key(desired))

    def test_cached_source_identity_skips_redownload(self):
        _, desired = lp.source_details(record())
        dest = lp.CACHE_DIR / lp.source_cache_id(desired) / desired["sourceFile"]
        dest.parent.mkdir(parents=True)
        dest.write_bytes(b"cached source")
        with patch.object(lp.urllib.request, "urlopen") as fetch:
            lp.download("https://zenodo.org/source.tif", dest)
            fetch.assert_not_called()

    def test_missing_tiles_and_unavailable_source_fail_before_build(self):
        (self.tiles / "0_0.png").unlink()
        self.source.write_text(json.dumps({"error": "offline"}))
        self.assertEqual(self.run_main("--source", str(self.source)), 1)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
