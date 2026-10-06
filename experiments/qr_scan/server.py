"""QR読み取りの検証用に static/ を HTTPS で配信する。

展示用端末のブラウザでカメラを使うにはセキュアコンテキスト(HTTPS)が必要なため、
自己署名証明書で配信する。基盤(core/)とは独立しており、標準ライブラリだけで動く(Python 3.9 以上)。
ファイアウォールの都合で、許可されている /usr/bin/python3 で起動する(scripts/lan_relay.py と同じ)。

    /usr/bin/python3 experiments/qr_scan/server.py            # https://<MacのIP>:8443/

証明書は初回起動時に certs/ へ作る。MacのIPが変わったら certs/ を消して起動し直す。
"""

import argparse
import functools
import http.server
import socket
import ssl
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
CERT_DIR = HERE / "certs"


def lan_ip():
    # 実際には送信しない。経路表から LAN 側のアドレスを得るためだけに connect する
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def ensure_cert(ip):
    cert, key = CERT_DIR / "cert.pem", CERT_DIR / "key.pem"
    if cert.exists() and key.exists():
        return cert, key
    CERT_DIR.mkdir(exist_ok=True)
    subprocess.run(
        [
            "/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(key), "-out", str(cert), "-days", "30",
            "-subj", "/CN=akabane-qr-test",
            "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost",
        ],
        check=True,
        capture_output=True,
    )
    return cert, key


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8443)
    args = parser.parse_args()

    ip = lan_ip()
    cert, key = ensure_cert(ip)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(HERE / "static"))
    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)

    base = f"https://{ip}:{args.port}"
    print(f"読み取り(PC・タブレット): {base}/scan.html", flush=True)
    print(f"参加証(スマホ):           {base}/pass.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
