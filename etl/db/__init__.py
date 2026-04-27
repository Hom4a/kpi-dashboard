"""Repository layer: write canonical facts into a fact store.

Two implementations:
  - ``FakeRepository`` — in-memory, for unit tests
  - ``PostgresRepository`` — psycopg2-backed, for production writeback

Both share the same ``Repository`` ABC defined in ``interface``.
"""
from .batch import build_batch_from_canonical
from .fake import FakeRepository
from .interface import Repository, WriteBatch, WriteResult

__all__ = [
    "FakeRepository",
    "Repository",
    "WriteBatch",
    "WriteResult",
    "build_batch_from_canonical",
]
