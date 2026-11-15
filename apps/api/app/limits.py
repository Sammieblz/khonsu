"""Resource limits shared by validation, retrieval and scientific processing."""

MIN_FOV_ARCMIN = 0.5
MAX_FOV_ARCMIN = 120.0
MAX_OBSERVATIONS = 96
MAX_CUTOUT_ARCMIN = 180.0
MAX_GRID_SIDE = 2048
MAX_RASTER_BYTES = MAX_GRID_SIDE * MAX_GRID_SIDE * 5
MAX_FITS_BYTES = 64 * 1024 * 1024
MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
# Preserve the previous total output budget while allowing fewer, larger frames.
MAX_OUTPUT_PIXELS_TOTAL = 96 * 512 * 512
