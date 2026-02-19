# SISDMK2 REST API

Backend REST API Node.js + Express untuk MariaDB existing `sisdmk2`.

## Install

```bash
npm i
```

## Konfigurasi

Copy `.env.example` menjadi `.env`, lalu isi:

```env
PORT=3001
API_KEY=your-secret-key
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USER=root
DB_PASS=Tianh@27
DB_NAME=sisdmk2
ALLOWED_ORIGINS=
```

## Run

```bash
node server.js
```

## Endpoint

Semua endpoint wajib header `x-api-key`.

### 1) Health

```bash
curl -H "x-api-key: your-secret-key" http://127.0.0.1:3001/health
```

### 2) List pegawai

```bash
curl -G http://127.0.0.1:3001/pegawai \
  -H "x-api-key: your-secret-key" \
  --data-urlencode "limit=20" \
  --data-urlencode "offset=0" \
  --data-urlencode "q=andi" \
  --data-urlencode "wilayah=jakarta" \
  --data-urlencode "nama_ukpd=Dinas X" \
  --data-urlencode "status_pegawai=aktif"
```

### 3) Detail pegawai

```bash
curl -H "x-api-key: your-secret-key" http://127.0.0.1:3001/pegawai/3173xxxxxxxxxxxx
```

### 4) Create pegawai

```bash
curl -X POST http://127.0.0.1:3001/pegawai \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{
    "nik": "3173xxxxxxxxxxxx",
    "nama": "Nama Pegawai",
    "nama_ukpd": "Dinas Contoh",
    "wilayah": "Jakarta Selatan",
    "status_pegawai": "aktif",
    "jabatan_orb": "Analis",
    "alamat": {
      "ktp": {
        "jalan": "Jl. Mawar",
        "kelurahan": "Kel A",
        "kecamatan": "Kec A",
        "kota_kabupaten": "Jakarta Selatan",
        "provinsi": "DKI Jakarta"
      },
      "domisili": {
        "jalan": "Jl. Melati",
        "kelurahan": "Kel B",
        "kecamatan": "Kec B",
        "kota_kabupaten": "Jakarta Timur",
        "provinsi": "DKI Jakarta"
      }
    },
    "keluarga": [
      {
        "hubungan": "istri",
        "nama": "Nama Pasangan",
        "jenis_kelamin": "P",
        "tanggal_lahir": "1990-01-01"
      }
    ]
  }'
```

### 5) Update pegawai

```bash
curl -X PUT http://127.0.0.1:3001/pegawai/3173xxxxxxxxxxxx \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{
    "nama_ukpd": "Dinas Baru",
    "status_pegawai": "aktif",
    "alamat": {
      "domisili": {
        "jalan": "Jl. Baru 123",
        "kelurahan": "Kel C"
      }
    },
    "keluarga": []
  }'
```

### 6) Delete pegawai

```bash
curl -X DELETE -H "x-api-key: your-secret-key" http://127.0.0.1:3001/pegawai/3173xxxxxxxxxxxx
```

### 7) List UKPD

```bash
curl -H "x-api-key: your-secret-key" http://127.0.0.1:3001/ukpd
```

## Cloudflare Tunnel example

`config.yml`:

```yaml
tunnel: your-tunnel-id
credentials-file: C:\Users\<user>\.cloudflared\your-tunnel-id.json

ingress:
  - hostname: api.kepegawaian.media
    service: http://127.0.0.1:3001
  - service: http_status:404
```

Catatan: expose hanya API (`3001`). Jangan expose MariaDB (`3306`) ke internet.

