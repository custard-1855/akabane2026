"""一般向けサーバと管理サーバで共通の静的配信。"""

from starlette.staticfiles import StaticFiles


class NoCacheStaticFiles(StaticFiles):
    """アプリ更新後に端末が古い JS/CSS を使い続けないよう、毎回再検証させる(要件 7章)。"""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response
