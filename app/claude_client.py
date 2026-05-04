from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from .config import get_settings


class ClaudeClient:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to your .env file."
            )
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model
        self._max_tokens = settings.max_tokens

    async def stream_completion(
        self, system: str, messages: list[dict]
    ) -> AsyncIterator[str]:
        kwargs = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def summarize_title(self, user_message: str, assistant_reply: str) -> str:
        prompt = (
            "Summarize this conversation as a short title (max 6 words, no quotes). "
            "Return only the title.\n\n"
            f"User: {user_message[:500]}\n"
            f"Assistant: {assistant_reply[:500]}"
        )
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}],
        )
        for block in response.content:
            if block.type == "text":
                return block.text.strip().strip('"').strip("'")[:80] or "New chat"
        return "New chat"


_client: ClaudeClient | None = None


def get_claude_client() -> ClaudeClient:
    global _client
    if _client is None:
        _client = ClaudeClient()
    return _client
