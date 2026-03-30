import unittest

from app.models.schemas import SmokeTestAddress, SmokeTestConfig, SmokeTestUser
from app.tests.smoke_runner import SmokeManager


class SmokeRunnerTests(unittest.TestCase):
    def test_configured_path_overrides_default(self):
        cfg = SmokeTestConfig(
            brand="WS_US",
            env="prod",
            region="EAST",
            base_url="https://example.com",
            vip_url="https://example.com",
            server_urls=[],
            test_user=SmokeTestUser(username="u", password="p"),
            product_search_term="chair",
            address=SmokeTestAddress(name="n", city="c", zip="z"),
            step_paths={"login": "/custom/login"},
        )
        url = SmokeManager._build_configured_step_url(cfg, "https://example.com", "login", "/login", "/smoke/login")
        self.assertEqual(url, "https://example.com/custom/login")

    def test_default_live_path_for_non_local_target(self):
        cfg = SmokeTestConfig(
            brand="WS_US",
            env="prod",
            region="EAST",
            base_url="https://example.com",
            vip_url="https://example.com",
            server_urls=[],
            test_user=SmokeTestUser(username="u", password="p"),
            product_search_term="chair",
            address=SmokeTestAddress(name="n", city="c", zip="z"),
        )
        url = SmokeManager._build_configured_step_url(cfg, "https://example.com", "login", "/login", "/smoke/login")
        self.assertEqual(url, "https://example.com/login")


if __name__ == "__main__":
    unittest.main()

