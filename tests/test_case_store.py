from core import case_store


def test_store(tmp_path, monkeypatch):
    monkeypatch.setattr(case_store, "CASE_STORE", tmp_path / "d" / "c.jsonl")
    assert case_store.get_case("a") is None
    assert case_store.update_case_status("a", "x") is False
    case_store.save_case("a", {"k": 1})
    assert case_store.update_case_status("a", "s1")
    assert case_store.update_case_status("a", "s2")
    case_store.save_case("b", {})
    c = case_store.get_case("a")
    assert c["packet"] == {"k": 1} and c["status"] == "s2" and len(c["history"]) == 2
    assert case_store.list_cases() == ["a", "b"]
