import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.DB_NAME || "sisdmk2";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "host.docker.internal",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const OPTIONAL_DELETE_TABLES = [
  "keluarga",
  "alamat",
  "pendidikan_formal",
  "pendidikan_nonformal",
  "riwayat_jabatan",
  "riwayat_pangkat",
  "riwayat_skp",
  "penghargaan",
  "hukuman_disiplin",
  "riwayat_gaji_pokok",
];

const tableExistsCache = new Map();
const tableColumnsCache = new Map();

function formatTanggalID(dateObj = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateObj);
}

async function execute(sql, params = [], conn = null) {
  const db = conn || pool;
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function tableExists(tableName, conn = null) {
  if (tableExistsCache.has(tableName)) return tableExistsCache.get(tableName);

  const rows = await execute(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
      LIMIT 1`,
    [DB_NAME, tableName],
    conn
  );
  const exists = rows.length > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function getTableColumns(tableName, conn = null) {
  if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);

  const rows = await execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
      ORDER BY ordinal_position`,
    [DB_NAME, tableName],
    conn
  );

  const columns = rows.map((r) => r.column_name);
  tableColumnsCache.set(tableName, columns);
  return columns;
}

function hasCol(columns, colName) {
  return columns.includes(colName);
}

function firstExistingCol(columns, candidates = []) {
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  return null;
}

function pickProvidedFields(payload, mapping, validColumns) {
  const out = {};
  for (const [inputKey, targetCols] of Object.entries(mapping)) {
    if (payload[inputKey] === undefined) continue;
    const candidates = Array.isArray(targetCols) ? targetCols : [targetCols];
    const target = firstExistingCol(validColumns, candidates);
    if (target) out[target] = payload[inputKey];
  }
  return out;
}

function normalizeRoleFromUkpd(ukpdRow = {}) {
  const rawRole =
    ukpdRow.role ??
    ukpdRow.jenis_ukpd ??
    ukpdRow.level ??
    ukpdRow.user_role ??
    "";
  const role = String(rawRole).trim().toLowerCase();
  return role || "user";
}

function sanitizeUkpdForSession(ukpdRow = {}) {
  const safe = {};
  const safeKeys = ["ukpd_id", "nama_ukpd", "jenis_ukpd", "wilayah", "username", "email", "role"];
  for (const key of safeKeys) {
    if (ukpdRow[key] !== undefined && ukpdRow[key] !== null) {
      safe[key] = ukpdRow[key];
    }
  }
  return safe;
}

async function verifyUkpdPassword(rawPassword, ukpdRow, ukpdColumns) {
  if (!rawPassword) return false;

  const passwordCandidates = [];
  if (ukpdColumns.includes("password_hash")) passwordCandidates.push(ukpdRow.password_hash);
  if (ukpdColumns.includes("password")) passwordCandidates.push(ukpdRow.password);

  for (const storedValue of passwordCandidates) {
    if (!storedValue) continue;
    const stored = String(storedValue);
    const maybeBcrypt = stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");

    if (maybeBcrypt) {
      const ok = await bcrypt.compare(rawPassword, stored);
      if (ok) return true;
      continue;
    }

    if (stored === rawPassword) {
      return true;
    }
  }

  return false;
}

function mapPegawaiToLegacy(pegawaiRow, alamatKtp = null, alamatDomisili = null) {
  const p = pegawaiRow || {};
  const v = (key, fallback = "") => (p[key] !== undefined && p[key] !== null ? p[key] : fallback);

  const idValue = v("tmp_id", "") || v("nik", "");
  const nipRaw = v("nip", "") || v("nip_norm", "");

  return {
    id: idValue ? String(idValue) : "",
    nip: nipRaw ? String(nipRaw) : "",
    nrk: String(v("nrk", "")),
    npwp: String(v("npwp", "")),
    nama: String(v("nama", "")),
    nama_pegawai: String(v("nama", "")),
    jabatan: String(v("jabatan_orb", "")),
    nama_jabatan_orb: String(v("jabatan_orb", "")),
    ukpd: String(v("nama_ukpd", "")),
    nama_ukpd: String(v("nama_ukpd", "")),
    wilayah: String(v("wilayah", "")),
    wilayah_ukpd: String(v("wilayah", "")),
    nama_status_aktif: String(v("status_pegawai", "")),
    nama_status_rumpun: String(v("status_rumpun", "")),
    jenis_kontrak: String(v("jenis_kontrak", "")),
    nama_jenis_pegawai: String(v("jenis_pegawai", "")),
    tmt_kerja_ukpd: String(v("tmt_kerja_ukpd", "")),
    nik: String(v("nik", "")),
    jenis_kelamin: String(v("jenis_kelamin", "")),
    tempat_lahir: String(v("tempat_lahir", "")),
    tanggal_lahir: String(v("tanggal_lahir", "")),
    agama: String(v("agama", "")),
    status_pernikahan: String(v("status_pernikahan", "")),
    gelar_depan: String(v("gelar_depan", "")),
    gelar_belakang: String(v("gelar_belakang", "")),
    golongan_darah: String(v("golongan_darah", "")),
    jenjang_pendidikan: String(v("jenjang_pendidikan", "")),
    jurusan_pendidikan: String(v("jurusan_pendidikan", "")),
    no_tlp: String(v("no_tlp", "")),
    email: String(v("email", "")),
    alamat_ktp: alamatKtp?.jalan ? String(alamatKtp.jalan) : "",
    alamat_domisili: alamatDomisili?.jalan ? String(alamatDomisili.jalan) : "",
    catatan_revisi_biodata: String(v("catatan_revisi_biodata", "")),
    tgl_update: p.updated_at ? formatTanggalID(new Date(p.updated_at)) : formatTanggalID(new Date()),
  };
}

function parseLimitOffset(rawLimit, rawOffset, defaultLimit = 1000) {
  const limitRaw = Number.parseInt(rawLimit ?? String(defaultLimit), 10);
  const offsetRaw = Number.parseInt(rawOffset ?? "0", 10);
  const limit = Number.isNaN(limitRaw) ? defaultLimit : Math.max(1, Math.min(limitRaw, 50000));
  const offset = Number.isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
  return { limit, offset };
}

function decorateBezettingRow(row = {}) {
  return {
    bidang: row.bidang || "-",
    subbidang: row.subbidang || "-",
    nama_jabatan_pergub: row.nama_jabatan_orb || row.jabatan || "-",
    nama_jabatan_permenpan: row.nama_jabatan_permenpan || "-",
    rumpun_jabatan: row.nama_status_rumpun || "-",
    kode: row.kode || "-",
    abk: row.abk || "-",
    eksisting: row.eksisting || "-",
    selisih: row.selisih || "-",
    nama_pegawai: row.nama_pegawai || row.nama || "-",
    nip: row.nip || "-",
    nrk: row.nrk || "-",
    status_formasi: row.nama_status_aktif || "-",
    pendidikan: row.jenjang_pendidikan || "-",
    ukpd: row.nama_ukpd || row.ukpd || "-",
    wilayah: row.wilayah_ukpd || row.wilayah || "-",
  };
}

async function fetchPegawaiMappedRows(query = {}, conn = null) {
  const cols = await getTableColumns("pegawai", conn);
  if (cols.length === 0) {
    throw new Error("Tabel pegawai tidak ditemukan.");
  }

  const { limit, offset } = parseLimitOffset(query.limit, query.offset, 30000);
  const whereParts = [];
  const params = [];

  if (query.q && hasCol(cols, "nama")) {
    whereParts.push("nama LIKE ?");
    params.push(`%${String(query.q)}%`);
  }
  if (query.wilayah && hasCol(cols, "wilayah")) {
    whereParts.push("wilayah = ?");
    params.push(String(query.wilayah));
  }
  if (query.nama_ukpd && hasCol(cols, "nama_ukpd")) {
    whereParts.push("nama_ukpd = ?");
    params.push(String(query.nama_ukpd));
  }
  if (query.ukpd && hasCol(cols, "nama_ukpd")) {
    whereParts.push("nama_ukpd = ?");
    params.push(String(query.ukpd));
  }
  if (query.status_pegawai && hasCol(cols, "status_pegawai")) {
    whereParts.push("status_pegawai = ?");
    params.push(String(query.status_pegawai));
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const orderCol = firstExistingCol(cols, ["nama", "nik", "tmp_id"]) || cols[0];
  const rows = await execute(
    `SELECT * FROM pegawai ${whereSql} ORDER BY \`${orderCol}\` ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    conn
  );

  const mapped = rows.map((row) => mapPegawaiToLegacy(row));
  return { rows: mapped, limit, offset };
}

async function findPegawaiByIdOrNik(idOrNik, conn = null) {
  const pegawaiCols = await getTableColumns("pegawai", conn);
  if (pegawaiCols.length === 0) return null;

  if (hasCol(pegawaiCols, "tmp_id")) {
    const rowsByTmpId = await execute("SELECT * FROM pegawai WHERE CAST(tmp_id AS CHAR) = ? LIMIT 1", [idOrNik], conn);
    if (rowsByTmpId.length > 0) return rowsByTmpId[0];
  }

  if (hasCol(pegawaiCols, "nik")) {
    const rowsByNik = await execute("SELECT * FROM pegawai WHERE nik = ? LIMIT 1", [idOrNik], conn);
    if (rowsByNik.length > 0) return rowsByNik[0];
  }

  return null;
}

async function getAlamatByTipe(nik, tipe, conn = null) {
  if (!(await tableExists("alamat", conn))) return null;
  const rows = await execute("SELECT * FROM alamat WHERE pegawai_nik = ? AND tipe_alamat = ? LIMIT 1", [nik, tipe], conn);
  return rows[0] || null;
}

async function upsertAlamatJalan(conn, nik, tipe, jalanValue) {
  if (!jalanValue || !(await tableExists("alamat", conn))) return;

  const alamatCols = await getTableColumns("alamat", conn);
  if (!hasCol(alamatCols, "pegawai_nik") || !hasCol(alamatCols, "tipe_alamat")) return;
  if (!hasCol(alamatCols, "jalan")) return;

  const exists = await execute(
    "SELECT 1 FROM alamat WHERE pegawai_nik = ? AND tipe_alamat = ? LIMIT 1",
    [nik, tipe],
    conn
  );

  if (exists.length > 0) {
    await execute("UPDATE alamat SET jalan = ? WHERE pegawai_nik = ? AND tipe_alamat = ?", [jalanValue, nik, tipe], conn);
  } else {
    await execute(
      "INSERT INTO alamat (pegawai_nik, tipe_alamat, jalan) VALUES (?, ?, ?)",
      [nik, tipe, jalanValue],
      conn
    );
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  const action = String(req.query.action || "").trim().toLowerCase();

  try {
    if (action === "health") {
      await execute("SELECT 1");
      return res.json({ ok: true, data: { time: new Date().toISOString() } });
    }

    if (action === "list") {
      const { rows, limit, offset } = await fetchPegawaiMappedRows(req.query);
      const units = Array.from(new Set(rows.map((r) => r.nama_ukpd).filter(Boolean))).sort();
      const jabs = Array.from(new Set(rows.map((r) => r.nama_jabatan_orb).filter(Boolean))).sort();
      const statuses = Array.from(new Set(rows.map((r) => r.nama_status_aktif).filter(Boolean))).sort();
      return res.json({ ok: true, rows, total: rows.length, limit, offset, units, jabs, statuses });
    }

    if (action === "bezetting_list") {
      const { rows, limit, offset } = await fetchPegawaiMappedRows(req.query);
      const bezettingRows = rows.map(decorateBezettingRow);
      return res.json({
        ok: true,
        rows: bezettingRows,
        total: bezettingRows.length,
        limit,
        offset,
        ukpds: Array.from(new Set(bezettingRows.map((r) => r.ukpd).filter(Boolean))).sort(),
        statuses: Array.from(new Set(bezettingRows.map((r) => r.status_formasi).filter(Boolean))).sort(),
        rumpuns: Array.from(new Set(bezettingRows.map((r) => r.rumpun_jabatan).filter(Boolean))).sort(),
        jabatans: Array.from(
          new Set(bezettingRows.flatMap((r) => [r.nama_jabatan_pergub, r.nama_jabatan_permenpan]).filter(Boolean))
        ).sort(),
      });
    }

    if (action === "qna_list") {
      return res.json({ ok: true, rows: [] });
    }

    await execute("SELECT 1");
    return res.json({
      ok: true,
      success: true,
      message: "SIKEPEG API MariaDB is running.",
      endpoints: [
        "POST   /login",
        "POST   /auth/login",
        "GET    /pegawai",
        "GET    /pegawai/:id",
        "PUT    /pegawai/:id",
        "POST   /pegawai/create",
        "POST   /pegawai/update",
        "POST   /pegawai/delete",
      ],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: String(err.message || err) });
  }
});

app.get("/health", async (req, res) => {
  try {
    await execute("SELECT 1");
    return res.json({ ok: true, success: true, db: "connected" });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: String(err.message || err) });
  }
});

const loginHandler = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "username dan password wajib diisi",
      });
    }

    if (!(await tableExists("ukpd"))) {
      return res.status(500).json({
        success: false,
        message: "Tabel ukpd tidak ditemukan.",
      });
    }

    const ukpdColumns = await getTableColumns("ukpd");
    const identityColumns = ["username", "email", "nama_ukpd", "ukpd_id", "kode_ukpd"].filter((c) =>
      ukpdColumns.includes(c)
    );

    if (identityColumns.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Kolom identitas login pada tabel ukpd tidak tersedia.",
      });
    }

    const whereSql = identityColumns.map((c) => `\`${c}\` = ?`).join(" OR ");
    const params = identityColumns.map(() => String(username));

    const rows = await execute(`SELECT * FROM ukpd WHERE ${whereSql} LIMIT 1`, params);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Username atau password salah." });
    }

    const ukpdUser = rows[0];
    const validPassword = await verifyUkpdPassword(String(password), ukpdUser, ukpdColumns);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Username atau password salah." });
    }

    const role = normalizeRoleFromUkpd(ukpdUser);
    const user = sanitizeUkpdForSession({
      ...ukpdUser,
      role,
    });

    return res.json({
      success: true,
      message: "Login berhasil",
      token: crypto.randomUUID(),
      role,
      user,
    });
  } catch (err) {
    console.error("POST /login error:", err);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat login",
    });
  }
};

app.post("/login", loginHandler);
app.post("/auth/login", loginHandler);

app.post("/", async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();
  try {
    if (action === "login") {
      return loginHandler(req, res);
    }
    if (action === "create") {
      req.url = "/pegawai/create";
      return app._router.handle(req, res, () => {});
    }
    if (action === "update") {
      req.url = "/pegawai/update";
      return app._router.handle(req, res, () => {});
    }
    if (action === "delete") {
      req.url = "/pegawai/delete";
      return app._router.handle(req, res, () => {});
    }
    return res.status(400).json({ ok: false, error: "action tidak valid" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/pegawai", async (req, res) => {
  try {
    const cols = await getTableColumns("pegawai");
    if (cols.length === 0) {
      return res.status(500).json({ success: false, message: "Tabel pegawai tidak ditemukan." });
    }

    const { limit, offset } = parseLimitOffset(req.query.limit, req.query.offset, 1000);

    const orderCol = firstExistingCol(cols, ["nama", "nik", "tmp_id"]) || cols[0];
    const rows = await execute(
      `SELECT * FROM pegawai ORDER BY \`${orderCol}\` ASC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const data = rows.map((row) => mapPegawaiToLegacy(row));
    return res.json({ success: true, data, count: data.length, limit, offset });
  } catch (err) {
    console.error("GET /pegawai error:", err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  }
});

app.get("/pegawai/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const pegawai = await findPegawaiByIdOrNik(id);

    if (!pegawai) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    const nik = pegawai.nik;
    const [ktp, domisili] = await Promise.all([getAlamatByTipe(nik, "ktp"), getAlamatByTipe(nik, "domisili")]);
    return res.json({ success: true, data: mapPegawaiToLegacy(pegawai, ktp, domisili) });
  } catch (err) {
    console.error("GET /pegawai/:id error:", err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  }
});

app.put("/pegawai/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = req.params.id;
    const pegawai = await findPegawaiByIdOrNik(id, conn);
    if (!pegawai) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    const cols = await getTableColumns("pegawai", conn);
    const payload = req.body || {};

    const mapping = {
      nik: ["nik"],
      nip: ["nip", "nip_norm"],
      nama: ["nama"],
      jabatan: ["jabatan_orb"],
      ukpd: ["nama_ukpd"],
      nama_status_aktif: ["status_pegawai"],
      nama_status_rumpun: ["status_rumpun"],
      jenis_kontrak: ["jenis_kontrak"],
      nama_jenis_pegawai: ["jenis_pegawai"],
      tmt_kerja_ukpd: ["tmt_kerja_ukpd"],
      jenis_kelamin: ["jenis_kelamin"],
      tempat_lahir: ["tempat_lahir"],
      tanggal_lahir: ["tanggal_lahir"],
      agama: ["agama"],
      status_pernikahan: ["status_pernikahan"],
      gelar_depan: ["gelar_depan"],
      gelar_belakang: ["gelar_belakang"],
      golongan_darah: ["golongan_darah"],
      jenjang_pendidikan: ["jenjang_pendidikan"],
      jurusan_pendidikan: ["jurusan_pendidikan"],
      no_tlp: ["no_tlp", "no_telp"],
      email: ["email"],
      catatan_revisi_biodata: ["catatan_revisi_biodata"],
    };

    const updateFields = pickProvidedFields(payload, mapping, cols);
    const oldNik = pegawai.nik;
    const newNik = updateFields.nik || oldNik;

    await conn.beginTransaction();

    const keys = Object.keys(updateFields);
    if (keys.length > 0) {
      const setSql = keys.map((k) => `\`${k}\` = ?`).join(", ");
      await execute(`UPDATE pegawai SET ${setSql} WHERE nik = ?`, [...keys.map((k) => updateFields[k]), oldNik], conn);
    }

    if (payload.alamat_ktp !== undefined) {
      await upsertAlamatJalan(conn, newNik, "ktp", payload.alamat_ktp);
    }
    if (payload.alamat_domisili !== undefined) {
      await upsertAlamatJalan(conn, newNik, "domisili", payload.alamat_domisili);
    }

    await conn.commit();
    return res.json({ success: true, message: "Data berhasil diperbarui" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /pegawai/:id error:", err);
    return res.status(500).json({ success: false, message: "Gagal update data" });
  } finally {
    conn.release();
  }
});

app.post("/pegawai/create", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const cols = await getTableColumns("pegawai", conn);
    if (cols.length === 0) {
      return res.status(500).json({ success: false, message: "Tabel pegawai tidak ditemukan." });
    }

    const payload = req.body || {};
    const generatedNik = `${Date.now()}`.slice(-16);
    const nik = String(payload.nik || generatedNik);

    const mapping = {
      nik: ["nik"],
      nip: ["nip", "nip_norm"],
      nama: ["nama"],
      jabatan: ["jabatan_orb"],
      ukpd: ["nama_ukpd"],
      nama_status_aktif: ["status_pegawai"],
      nama_status_rumpun: ["status_rumpun"],
      jenis_kontrak: ["jenis_kontrak"],
      nama_jenis_pegawai: ["jenis_pegawai"],
      tmt_kerja_ukpd: ["tmt_kerja_ukpd"],
      jenis_kelamin: ["jenis_kelamin"],
      tempat_lahir: ["tempat_lahir"],
      tanggal_lahir: ["tanggal_lahir"],
      agama: ["agama"],
      status_pernikahan: ["status_pernikahan"],
      gelar_depan: ["gelar_depan"],
      gelar_belakang: ["gelar_belakang"],
      golongan_darah: ["golongan_darah"],
      jenjang_pendidikan: ["jenjang_pendidikan"],
      jurusan_pendidikan: ["jurusan_pendidikan"],
      no_tlp: ["no_tlp", "no_telp"],
      email: ["email"],
      catatan_revisi_biodata: ["catatan_revisi_biodata"],
    };

    const insertFields = pickProvidedFields({ ...payload, nik }, mapping, cols);
    if (!insertFields.nama) {
      return res.status(400).json({ success: false, message: "nama wajib diisi" });
    }

    await conn.beginTransaction();

    const nikCol = firstExistingCol(cols, ["nik"]);
    if (nikCol) {
      const exists = await execute("SELECT 1 FROM pegawai WHERE nik = ? LIMIT 1", [nik], conn);
      if (exists.length > 0) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: "NIK sudah terdaftar." });
      }
    }

    const keys = Object.keys(insertFields);
    const placeholders = keys.map(() => "?").join(", ");
    await execute(
      `INSERT INTO pegawai (${keys.map((k) => `\`${k}\``).join(", ")}) VALUES (${placeholders})`,
      keys.map((k) => insertFields[k]),
      conn
    );

    if (payload.alamat_ktp !== undefined) {
      await upsertAlamatJalan(conn, nik, "ktp", payload.alamat_ktp);
    }
    if (payload.alamat_domisili !== undefined) {
      await upsertAlamatJalan(conn, nik, "domisili", payload.alamat_domisili);
    }

    await conn.commit();
    return res.json({ success: true, message: "Data berhasil ditambahkan", newId: nik });
  } catch (err) {
    await conn.rollback();
    console.error("POST /pegawai/create error:", err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  } finally {
    conn.release();
  }
});

app.post("/pegawai/update", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const payload = req.body || {};
    const id = String(payload.id || "");
    if (!id) {
      return res.status(400).json({ success: false, message: "id wajib diisi untuk update" });
    }

    const pegawai = await findPegawaiByIdOrNik(id, conn);
    if (!pegawai) {
      return res.status(404).json({ success: false, message: "Data dengan id tersebut tidak ditemukan" });
    }

    const cols = await getTableColumns("pegawai", conn);
    const mapping = {
      nik: ["nik"],
      nip: ["nip", "nip_norm"],
      nama: ["nama"],
      jabatan: ["jabatan_orb"],
      ukpd: ["nama_ukpd"],
    };
    const updateFields = pickProvidedFields(payload, mapping, cols);

    await conn.beginTransaction();
    const keys = Object.keys(updateFields);
    if (keys.length > 0) {
      const setSql = keys.map((k) => `\`${k}\` = ?`).join(", ");
      await execute(`UPDATE pegawai SET ${setSql} WHERE nik = ?`, [...keys.map((k) => updateFields[k]), pegawai.nik], conn);
    }
    await conn.commit();

    return res.json({ success: true, message: "Data berhasil diupdate" });
  } catch (err) {
    await conn.rollback();
    console.error("POST /pegawai/update error:", err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  } finally {
    conn.release();
  }
});

app.post("/pegawai/delete", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, message: "id wajib diisi" });
    }

    const pegawai = await findPegawaiByIdOrNik(String(id), conn);
    if (!pegawai) {
      return res.status(404).json({ success: false, message: "Data dengan id tersebut tidak ditemukan" });
    }

    await conn.beginTransaction();

    for (const tableName of OPTIONAL_DELETE_TABLES) {
      if (await tableExists(tableName, conn)) {
        await execute(`DELETE FROM \`${tableName}\` WHERE pegawai_nik = ?`, [pegawai.nik], conn);
      }
    }
    await execute("DELETE FROM pegawai WHERE nik = ?", [pegawai.nik], conn);

    await conn.commit();
    return res.json({ success: true, message: "Data berhasil dihapus" });
  } catch (err) {
    await conn.rollback();
    console.error("POST /pegawai/delete error:", err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  } finally {
    conn.release();
  }
});

app.listen(PORT, () => {
  console.log(`SIKEPEG backend running on http://localhost:${PORT}`);
});
