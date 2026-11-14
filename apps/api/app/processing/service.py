"""Scientific processing implementation belongs here in the next milestone.

Preserve floating-point science values and quality masks; align to one WCS.
Render with a shared stretch only after scientific operations. Do not perform
HTTP requests here or manufacture a real-data manifest from synthetic inputs.
"""

from pathlib import Path

from ..interfaces import ObservationInput, ProcessingOptions
from ..schemas import SequenceManifest


class AstronomyProcessor:
    def process(
        self,
        observations: list[ObservationInput],
        options: ProcessingOptions,
        output_dir: Path,
    ) -> SequenceManifest:
        raise NotImplementedError("FITS processing is not implemented in this scaffold")
