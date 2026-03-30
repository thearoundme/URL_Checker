import json
import tempfile
import unittest
from pathlib import Path

from app.core.config_loader import ServiceConfigStore


def _service(name: str, platform: str) -> dict:
    return {
        "name": name,
        "env": "prod",
        "region": "EAST",
        "platform": platform,
        "category": "application",
        "type": "https",
        "url": f"https://{name}.example.com/health",
    }


class ConfigLoaderTests(unittest.IsolatedAsyncioTestCase):
    async def test_reload_after_file_removed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "services_vm.json").write_text(
                json.dumps({"services_vm": [_service("svc-vm", "vm")]}), encoding="utf-8"
            )
            (root / "services_k8.json").write_text(
                json.dumps({"services_k8": [_service("svc-k8", "k8")]}), encoding="utf-8"
            )
            (root / "services_tools.json").write_text(
                json.dumps({"services_tools": []}), encoding="utf-8"
            )
            (root / "smoke_tests.json").write_text(json.dumps({"smoke_tests": []}), encoding="utf-8")
            (root / "service_smoketest_user.json").write_text(
                json.dumps({"default_user": {"email": "a@b.com", "password": "x"}}), encoding="utf-8"
            )
            (root / "patching_tests.json").write_text(
                json.dumps({"patching_groups": []}), encoding="utf-8"
            )

            store = ServiceConfigStore(str(root))
            initial = await store.load()
            self.assertEqual(len(initial), 2)

            (root / "services_k8.json").unlink()
            reloaded = await store.get_services()
            self.assertEqual(len(reloaded), 1)
            self.assertEqual(reloaded[0].name, "svc-vm")


if __name__ == "__main__":
    unittest.main()

