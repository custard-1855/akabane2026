# QR読み取りの検証

参加証ページ(スマホ)に表示したQRを、展示用端末(PC・タブレット)のカメラで読めるかを確かめる。要件 4.8「読み取り方法の拡張」と 8章「HTTPS」の事前検証で、基盤(`core/`)とは独立している。

## 起動

```
/usr/bin/python3 experiments/qr_scan/server.py
```

起動時に表示される2つのURLを開く。証明書は自己署名なので、各端末で一度だけ警告を進める必要がある。

| 端末 | URL | 警告の進め方 |
|---|---|---|
| PC・タブレット | `https://<MacのIP>:8443/scan.html` | Chrome: 「詳細設定」→「<IP> にアクセスする(安全ではありません)」/ Safari: 「詳細を表示」→「このWebサイトを閲覧」 |
| スマホ | `https://<MacのIP>:8443/pass.html` | 同上。スマホを検証のため一時的に同じLANにつなぐ |

- `scan.html?decoder=jsqr` で、BarcodeDetector がある環境でも jsQR を使う。
- `http://` で開くとカメラが使えないことも確認できる(手入力欄だけ動く)。
- 手入力欄は2次元コードスキャナ(キーボードとして入力する機種)の確認にも使える。

## 確認すること

- 端末ごとにカメラが起動するか(Androidタブレット Chrome、Windows Chrome/Edge、Mac Chrome/Safari、iPad Safari)
- 前面カメラで、スマホ画面のQRが読めるか。距離・角度・画面の明るさ・照明の映り込み
- 1回の読み取りにかかる秒数(表の「開始からの秒数」)
- 使われたデコーダ(Windows の Chrome には BarcodeDetector が無く、jsQR になる)
- 自己署名証明書のまま運用できるか。カメラ許可が再読み込みのたびに求められるか
