import json
from collections.abc import AsyncIterator
from typing import Literal

from env.chat import env as chat_env
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from mistralai.client import Mistral
from mistralai.client.models.completionevent import CompletionEvent
from pydantic import BaseModel, Field
from utils.mistral import MistralNotConfiguredError, caller_mistral_client

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None


def _client() -> Mistral:
    try:
        return caller_mistral_client()
    except MistralNotConfiguredError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def _delta_text(event: CompletionEvent) -> str:
    parts: list[str] = []
    for choice in event.data.choices:
        content = choice.delta.content
        if content is None:
            continue
        if isinstance(content, str):
            parts.append(content)
        else:
            for chunk in content:
                if getattr(chunk, "type", "text") == "text":
                    parts.append(getattr(chunk, "text", ""))
    return "".join(parts)


async def _stream(client: Mistral, request: ChatRequest) -> AsyncIterator[str]:
    events = await client.chat.stream_async(
        model=request.model or chat_env.chat_model,
        messages=[message.model_dump() for message in request.messages],
    )
    async for event in events:
        text = _delta_text(event)
        if text:
            yield f"data: {json.dumps({'text': text})}\n\n"
    yield "data: [DONE]\n\n"


@router.post(
    "",
    operation_id="chat",
    summary="Stream a chat completion as server-sent events",
    response_class=StreamingResponse,
)
async def chat(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(_stream(_client(), request), media_type="text/event-stream")
