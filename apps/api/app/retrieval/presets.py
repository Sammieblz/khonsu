"""Cited reference positions and approximate moving-target search centres.

Equatorial coordinate equinox/frame and the measurement epoch are distinct.
Linear proper motion omits parallax, perspective acceleration and binary
orbital motion. These are field-search centres, never measured ephemerides.
"""

from __future__ import annotations

import math


def _ra(hours: float, minutes: float, seconds: float) -> float:
    return 15 * (hours + minutes / 60 + seconds / 3600)


def _dec(degrees: float, minutes: float, seconds: float) -> float:
    return (1 if degrees >= 0 else -1) * (abs(degrees) + minutes / 60 + seconds / 3600)


PRESETS: dict[str, dict] = {
    "barnards-star": {
        "label": "Barnard's Star", "object_type": "High proper-motion star",
        "reference_ra_deg": _ra(17, 57, 48.4984700685),
        "reference_dec_deg": _dec(4, 41, 36.113879676),
        "reference_epoch_jyear": 2000.0,
        "pm_ra_cosdec_mas_yr": -801.551, "pm_dec_mas_yr": 10362.394,
        "source_url": "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+Star",
        "coordinate_note": "SIMBAD ICRS position at J2000, with Gaia proper motion. Approximate J2026 field centre; not a precision ephemeris.",
        "science_note": "Large proper motion is useful context; a short SPHEREx baseline need not show a perceptible shift.",
    },
    "epsilon-indi-b": {
        "label": "Epsilon Indi B", "object_type": "Brown dwarf binary field",
        "reference_ra_deg": _ra(22, 4, 10.523),
        "reference_dec_deg": _dec(-56, 46, 57.82),
        "reference_epoch_jyear": 1999.855,
        "pm_ra_cosdec_mas_yr": 4131.0, "pm_dec_mas_yr": -2489.0,
        "source_url": "https://arxiv.org/pdf/astro-ph/0212487",
        "coordinate_note": "Discovery paper Table 1 Ks position: J2000 equatorial coordinates measured at epoch 1999.855. Approximate J2026 proper-motion field centre for the B pair, not primary A.",
        "science_note": "The Ba/Bb pair is not expected to be resolved by SPHEREx; binary orbital motion is omitted from this field centre.",
    },
    "wise-0855": {
        "label": "WISE 0855", "object_type": "Cold brown dwarf field",
        "reference_ra_deg": 133.787085, "reference_dec_deg": -7.244451,
        "reference_epoch_jyear": 2000 + (56677.3 - 51544.5) / 365.25,
        "pm_ra_cosdec_mas_yr": -8060.0, "pm_dec_mas_yr": 700.0,
        "source_url": "https://arxiv.org/pdf/1404.6501",
        "coordinate_note": "Luhman 2014 Table 2 Spitzer position at MJD 56677.3, J2000 equatorial coordinates, propagated with Table 1 proper motion to approximate J2026. Parallax omitted.",
        "science_note": "Very faint, red and blended at shorter wavelengths. Archive coverage does not establish a detection or measurable motion.",
    },
    "r-draconis": {
        "label": "R Draconis", "object_type": "Long-period variable star",
        "reference_ra_deg": _ra(16, 32, 40.2265999080),
        "reference_dec_deg": _dec(66, 45, 17.925901992),
        "reference_epoch_jyear": 2000.0,
        "pm_ra_cosdec_mas_yr": -20.643, "pm_dec_mas_yr": 6.149,
        "source_url": "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=R+Dra",
        "coordinate_note": "SIMBAD ICRS position at J2000, with Gaia proper motion. Approximate J2026 field centre.",
        "science_note": "Brightness comparisons require matching wavelength, quality and calibration; an animation alone is not a light curve.",
    },
    "rw-aurigae": {
        "label": "RW Aurigae", "object_type": "Young variable star field",
        "reference_ra_deg": _ra(5, 7, 49.5662483),
        "reference_dec_deg": _dec(30, 24, 5.177426),
        "reference_epoch_jyear": 2000.0,
        "pm_ra_cosdec_mas_yr": 7.23, "pm_dec_mas_yr": -20.33,
        "source_url": "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=RW+Aur",
        "coordinate_note": "SIMBAD ICRS position at J2000, with catalogued proper motion. Approximate J2026 field centre.",
        "science_note": "Complex young-star variability is a hypothesis for inspection, not an automated classification.",
    },
}


def preset_position(preset_id: str, epoch_jyear: float = 2026.0) -> tuple[float, float]:
    """First-order field centre; pmRA already includes cos(declination)."""
    if not math.isfinite(epoch_jyear) or not 1900 <= epoch_jyear <= 2100:
        raise ValueError("Search epoch must lie between J1900 and J2100")
    preset = PRESETS[preset_id]
    elapsed = epoch_jyear - preset["reference_epoch_jyear"]
    dec = preset["reference_dec_deg"]
    ra = preset["reference_ra_deg"] + elapsed * preset["pm_ra_cosdec_mas_yr"] / (3_600_000 * math.cos(math.radians(dec)))
    dec += elapsed * preset["pm_dec_mas_yr"] / 3_600_000
    return ra % 360, dec


for _preset_id, _preset in PRESETS.items():
    _preset["ra_deg"], _preset["dec_deg"] = preset_position(_preset_id)
    _preset["coordinate_frame"] = "ICRS"
    _preset["search_epoch_jyear"] = 2026.0

# Stable explicit alias for API callers that prefer a descriptive name.
PRESET_TARGETS = PRESETS
