"""Conservative target-position spectral matching, not spectrophotometry."""

from typing import TypeVar

T = TypeVar("T")
MAX_CENTER_SPREAD_IN_BANDWIDTHS = 0.25


def select_compatible_frames(frames: list[T]) -> list[T]:
    """Choose a same-detector group with a tightly bounded wavelength spread.

The full group center range must be <= 0.25 times its smallest bandwidth.
This avoids chained pairwise overlaps and does not imply equal spectral
responses across an entire field. Prefer distinct real epochs, then baseline.
"""
    best = []
    best_score = (-1, -1.0, -1)
    for detector in range(1, 7):
        ordered = sorted(
            (frame for frame in frames if frame.observation.detector == detector),
            key=lambda frame: frame.wavelength_um,
        )
        for start in range(len(ordered)):
            group = []
            minimum_width = float("inf")
            for frame in ordered[start:]:
                minimum_width = min(minimum_width, frame.bandwidth_um)
                spread = frame.wavelength_um - ordered[start].wavelength_um
                if spread > MAX_CENTER_SPREAD_IN_BANDWIDTHS * minimum_width:
                    break
                group.append(frame)
            times = sorted({frame.observation.observed_start_utc for frame in group})
            baseline = (times[-1] - times[0]).total_seconds() if times else 0.0
            score = (len(times), baseline, len(group))
            if score > best_score:
                best, best_score = group, score
    return sorted(best, key=lambda frame: (frame.observation.observed_start_utc, frame.observation.observation_id))
