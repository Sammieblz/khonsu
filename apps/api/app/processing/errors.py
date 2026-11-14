"""Stable scientific failures for the HTTP/job layer to translate."""


class ProcessingError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ProcessingCancelled(ProcessingError):
    def __init__(self):
        super().__init__("PROCESSING_CANCELLED", "Scientific processing was cancelled.")
