from types import SimpleNamespace

import pytest
from api.routers.api import chat as chat_module
from fastapi.testclient import TestClient
from utils.mistral import MistralNotConfiguredError

from conftest import build_app


def _event(content: object) -> SimpleNamespace:
    return SimpleNamespace(data=SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=content))]))


class _FakeStream:
    def __init__(self, events: list[SimpleNamespace]) -> None:
        self._events = events

    def __aiter__(self) -> "_FakeStream":
        return self

    async def __anext__(self) -> SimpleNamespace:
        if not self._events:
            raise StopAsyncIteration
        return self._events.pop(0)


class _FakeClient:
    def __init__(self, events: list[SimpleNamespace]) -> None:
        self.calls: list[dict] = []
        self._events = events
        self.chat = SimpleNamespace(stream_async=self._stream_async)

    async def _stream_async(self, *, model: str, messages: list[dict], **kwargs: object) -> _FakeStream:
        self.calls.append({"model": model, "messages": [dict(message) for message in messages]})
        return _FakeStream(self._events)


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_app())


def test_chat_streams_sse_deltas(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient([_event("Bonjour"), _event(None), _event(" !")])
    monkeypatch.setattr(chat_module, "caller_mistral_client", lambda: fake)

    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "salut"}]})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert 'data: {"text": "Bonjour"}\n\n' in res.text
    assert 'data: {"text": " !"}\n\n' in res.text
    assert res.text.endswith("data: [DONE]\n\n")
    assert fake.calls[0]["model"] == chat_module.chat_env.chat_model
    assert fake.calls[0]["messages"] == [{"role": "user", "content": "salut"}]


def test_chat_joins_text_chunks(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = [SimpleNamespace(type="text", text="a"), SimpleNamespace(type="image_url", url="x"), SimpleNamespace(type="text", text="b")]
    fake = _FakeClient([_event(chunks)])
    monkeypatch.setattr(chat_module, "caller_mistral_client", lambda: fake)

    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "salut"}]})

    assert res.status_code == 200
    assert 'data: {"text": "ab"}\n\n' in res.text


def test_chat_honours_the_model_override(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient([_event("ok")])
    monkeypatch.setattr(chat_module, "caller_mistral_client", lambda: fake)

    res = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "salut"}], "model": "mistral-small-latest"},
    )

    assert res.status_code == 200
    assert fake.calls[0]["model"] == "mistral-small-latest"


def test_chat_answers_503_without_a_credential(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise() -> None:
        raise MistralNotConfiguredError("no credential")

    monkeypatch.setattr(chat_module, "caller_mistral_client", _raise)

    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "salut"}]})

    assert res.status_code == 503
    assert res.json()["detail"] == "no credential"


def test_chat_rejects_an_empty_history(client: TestClient) -> None:
    res = client.post("/api/chat", json={"messages": []})

    assert res.status_code == 422
