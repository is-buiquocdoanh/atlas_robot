"""
WebSocket broadcaster.

Runs in its own daemon thread with a private asyncio event loop.
All connected clients receive every broadcast (single shared channel).
Messages are JSON objects with a mandatory "type" field — clients filter
on that field to react to specific event types.

Usage from other threads:
    from . import ws_server
    ws_server.broadcast({'type': 'status', 'battery': 85, ...})
    ws_server.broadcast({'type': 'nav_succeeded', 'goal': {...}})
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Set

import websockets
from websockets.exceptions import ConnectionClosed

log = logging.getLogger(__name__)

_clients: Set = set()
_lock           = threading.Lock()
_loop: asyncio.AbstractEventLoop | None = None


# ── WebSocket handler ────────────────────────────────────────────────────────

async def _handler(websocket):
    with _lock:
        _clients.add(websocket)
    log.debug('WS client connected  total=%d', len(_clients))
    try:
        # Keep connection alive; ignore incoming messages
        async for _ in websocket:
            pass
    except ConnectionClosed:
        pass
    finally:
        with _lock:
            _clients.discard(websocket)
        log.debug('WS client disconnected  total=%d', len(_clients))


# ── Broadcast ────────────────────────────────────────────────────────────────

async def _do_broadcast(message: str):
    with _lock:
        targets = list(_clients)
    if not targets:
        return
    dead = []
    for ws in targets:
        try:
            await ws.send(message)
        except Exception:
            dead.append(ws)
    if dead:
        with _lock:
            for ws in dead:
                _clients.discard(ws)


def broadcast(data: dict):
    """Thread-safe: enqueue a JSON broadcast to all connected WS clients."""
    global _loop
    if _loop is None or not _clients:
        return
    asyncio.run_coroutine_threadsafe(_do_broadcast(json.dumps(data)), _loop)


# ── Server startup ────────────────────────────────────────────────────────────

def start(host: str = '0.0.0.0', port: int = 9090) -> threading.Thread:
    """Start the WebSocket server in a background daemon thread."""

    def _run():
        global _loop
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)

        async def _serve():
            async with websockets.serve(_handler, host, port):
                log.info('WebSocket server  ws://%s:%d', host, port)
                await asyncio.Future()   # run forever

        _loop.run_until_complete(_serve())

    t = threading.Thread(target=_run, name='atlas-ws', daemon=True)
    t.start()
    return t
