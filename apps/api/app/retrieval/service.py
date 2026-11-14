"""Live IRSA retrieval implementation belongs here in the next milestone."""

from pathlib import Path

from ..interfaces import ObservationInput
from ..schemas import SequenceRequest


class IrsaRetriever:
    async def retrieve(
        self, request: SequenceRequest, download_dir: Path
    ) -> list[ObservationInput]:
        raise NotImplementedError("Live IRSA retrieval is not implemented in this scaffold")
