FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    KHONSU_FIXTURE_DIR=/app/fixtures

WORKDIR /app
COPY apps/api/requirements.txt ./requirements.txt
COPY apps/api/requirements-science.txt ./requirements-science.txt
ARG INSTALL_SCIENCE=true
RUN if [ "$INSTALL_SCIENCE" = "true" ]; then \
      pip install --no-cache-dir -r requirements-science.txt; \
    else \
      pip install --no-cache-dir -r requirements.txt; \
    fi \
    && groupadd --system khonsu \
    && useradd --system --gid khonsu --no-create-home khonsu

COPY --chown=khonsu:khonsu apps/api/app ./app
COPY --chown=khonsu:khonsu fixtures ./fixtures
USER khonsu
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

