"""Recursive left-to-right character splitter.

Tries each separator in order (largest structural unit first); any piece still
larger than ``chunk_size`` is recursively split with the next separator. Small
pieces are merged up to ``chunk_size`` with a trailing ``overlap`` carried into
the next chunk. Adapted from the classic recursive-character-splitter algorithm.
"""

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def split_text(text, chunk_size=3000, overlap=500, separators=None):
    if separators is None:
        separators = DEFAULT_SEPARATORS
    return _split(text, chunk_size, overlap, separators)


def _split(text, chunk_size, overlap, separators):
    # Pick the first separator that occurs in the text (last one, "", always matches).
    separator = separators[-1]
    remaining = []
    for i, sep in enumerate(separators):
        if sep == "":
            separator = sep
            remaining = []
            break
        if sep in text:
            separator = sep
            remaining = separators[i + 1:]
            break

    splits = list(text) if separator == "" else text.split(separator)

    final = []
    good = []
    for piece in splits:
        if len(piece) <= chunk_size:
            good.append(piece)
            continue
        if good:
            final.extend(_merge(good, separator, chunk_size, overlap))
            good = []
        if remaining:
            final.extend(_split(piece, chunk_size, overlap, remaining))
        else:
            final.append(piece)  # atom larger than chunk_size, cannot split further
    if good:
        final.extend(_merge(good, separator, chunk_size, overlap))
    return final


def _merge(splits, separator, chunk_size, overlap):
    sep_len = len(separator)
    chunks = []
    current = []
    total = 0
    for piece in splits:
        added = len(piece) + (sep_len if current else 0)
        if total + added > chunk_size and current:
            joined = separator.join(current)
            if joined:
                chunks.append(joined)
            # Drop from the front until the remaining length fits the overlap window.
            while total > overlap and current:
                removed = current.pop(0)
                total -= len(removed) + (sep_len if current else 0)
        current.append(piece)
        total += len(piece) + (sep_len if len(current) > 1 else 0)
    joined = separator.join(current)
    if joined:
        chunks.append(joined)
    return chunks
