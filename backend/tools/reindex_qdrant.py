"""Copy document vectors from SQLite into Qdrant, and remove index entries for deleted documents.

Run from backend/, with VECTOR_STORE=qdrant and QDRANT_URL (or QDRANT_PATH) set:

    python tools/reindex_qdrant.py            # index every stored document (no re-embedding)
    python tools/reindex_qdrant.py --prune    # also remove entries whose document is gone

Use it when you first switch to Qdrant, after restoring a backup, and after a
failed delete (the search already hides those entries; --prune removes them).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import database  # noqa: E402
import models  # noqa: E402,F401  (registers the tables)
from services import vectorstore  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prune", action="store_true", help="also remove index entries for deleted documents")
    args = parser.parse_args(argv)

    database.init_db()
    with database.SessionLocal() as db:
        indexed = vectorstore.reindex(db)
        print(f"Indexed {indexed} document(s).")
        if args.prune:
            print(f"Removed {vectorstore.prune(db)} stale document(s) from the index.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
