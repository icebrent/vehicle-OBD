from scripts.check_repository_privacy import inspect_blob


def test_rejects_private_file_paths_even_when_force_added():
    for name in ("data/report.md", "frontend/test-results/screen.png", ".env", "docs/export.csv"):
        assert inspect_blob(name, b"sample")
    assert inspect_blob("data/.gitkeep", b"") == []


def test_detects_identity_without_echoing_sensitive_content():
    mac = ":".join(["AA", "BB", "CC", "DD", "EE", "FF"])
    path = "C:" + "\\Users\\" + "sample-person" + "\\file.txt"
    assert "device MAC address" in inspect_blob("docs/example.md", mac.encode())
    assert "personal Windows path" in inspect_blob("docs/example.md", path.encode())
    assert inspect_blob("tests/synthetic.py", b'payload = "0011223344556677"') == []
