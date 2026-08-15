# Dockerfile — Vizit Notu Cloud Run Dağıtımı
FROM python:3.13-slim

WORKDIR /app

# WeasyPrint ve sistem bağımlılıkları
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    libgobject-2.0-0 \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libfontconfig1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıklar
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Kod dosyaları
COPY backend ./backend
COPY frontend ./frontend

# Çalışma dizinleri ve varsayılan ortam değişkenleri
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV DB_PATH=/data/vizit.db

RUN mkdir -p /data

EXPOSE 8000

# main.py düz (paket olmayan) import kullandığı için çalışma dizini backend olmalı
CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
