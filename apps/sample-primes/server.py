"""計算APIのサンプル。基盤が /api/sample-primes 配下に登録する。"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class PrimesIn(BaseModel):
    limit: int = Field(ge=2, le=20_000_000)


class PrimesOut(BaseModel):
    limit: int
    count: int
    largest: int  # N 以下で最大の素数


@router.post("/primes")
def count_primes(body: PrimesIn) -> PrimesOut:
    # 重い処理なので async def ではなく def にする(スレッドプールで実行される。要件 7章)
    n = body.limit
    sieve = bytearray([1]) * (n + 1)
    sieve[0:2] = b"\x00\x00"
    for i in range(2, int(n**0.5) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytes(len(range(i * i, n + 1, i)))
    largest = next(i for i in range(n, 1, -1) if sieve[i])
    return PrimesOut(limit=n, count=sum(sieve), largest=largest)
