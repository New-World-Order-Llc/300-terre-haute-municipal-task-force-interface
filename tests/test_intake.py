from core.intake import intake


def test_intake():
    assert intake({"x": 1})["status"] == "received"
