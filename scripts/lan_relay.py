"""LAN からの接続を 127.0.0.1 の一般向けサーバへ中継する。

macOS のファイアウォールが uv の Python への外部接続をブロックしている場合に使う。
ファイアウォールで許可されている /usr/bin/python3 で起動する。標準ライブラリだけで動く(Python 3.9 以上)。

    uv run uvicorn core.main:app --host 127.0.0.1 --port 3002
    /usr/bin/python3 scripts/lan_relay.py              # 0.0.0.0:3000 → 127.0.0.1:3002

サーバから見た接続元はすべて 127.0.0.1 になる。一般向けサーバは接続元の IP を使わないので動作は変わらない。
"""

import argparse
import asyncio


async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionError, OSError):
        pass
    finally:
        try:
            writer.close()
        except OSError:
            pass


def make_handler(upstream_host, upstream_port):
    async def handle(client_reader, client_writer):
        try:
            up_reader, up_writer = await asyncio.open_connection(upstream_host, upstream_port)
        except OSError as e:
            print(f"upstream {upstream_host}:{upstream_port} に接続できない: {e}", flush=True)
            client_writer.close()
            return
        await asyncio.gather(pipe(client_reader, up_writer), pipe(up_reader, client_writer))

    return handle


async def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--listen-host", default="0.0.0.0")
    parser.add_argument("--listen-port", type=int, default=3000)
    parser.add_argument("--upstream-host", default="127.0.0.1")
    parser.add_argument("--upstream-port", type=int, default=3002)
    args = parser.parse_args()

    server = await asyncio.start_server(
        make_handler(args.upstream_host, args.upstream_port), args.listen_host, args.listen_port
    )
    print(
        f"relay {args.listen_host}:{args.listen_port} → {args.upstream_host}:{args.upstream_port}",
        flush=True,
    )
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
