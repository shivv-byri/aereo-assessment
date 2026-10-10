"""Bound multipart request bodies before Starlette parses file parts."""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class UploadBodyTooLarge(Exception):
    pass


class UploadBodyLimit:
    def __init__(self, app: ASGIApp, max_upload_bytes: int):
        self.app = app
        # Multipart boundaries and headers need some room beyond the file limit.
        self.max_body_bytes = max_upload_bytes + 64 * 1024

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/api/files/"
        ):
            await self.app(scope, receive, send)
            return

        for name, raw_value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(raw_value) > self.max_body_bytes:
                        await self._reject(scope, receive, send)
                        return
                except ValueError:
                    pass
                break

        received = 0
        response_started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    raise UploadBodyTooLarge
            return message

        async def tracked_send(message):
            nonlocal response_started
            response_started |= message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except UploadBodyTooLarge:
            if response_started:
                raise
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413, content={"detail": "Upload exceeds configured size limit"}
        )
        await response(scope, receive, send)
