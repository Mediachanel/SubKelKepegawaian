const express = require("express");
const { execute, pool, tableExists, getTableColumns } = require("../db");

const router = express.Router();

const RELATED_DELETE_TABLES = [
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

const ALAMAT_FIELDS = [
  "jalan",
  "kelurahan",
  "kecamatan",
  "kota_kabupaten",
  "provinsi",
  "kode_provinsi",
  "kode_kota_kab",
  "kode_kecamatan",
  "kode_kelurahan",
];

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function pickPayload(data, allowedFields) {
  const out = {};
  for (const key of Object.keys(data || {})) {
    if (allowedFields.includes(key) && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
}

function getOrderColumn(existingColumns, candidates, fallback = null) {
  for (const col of candidates) {
    if (existingColumns.includes(col)) return col;
  }
  return fallback;
}

async function fetchAlamatByType(conn, nik, tipe) {
  if (!(await tableExists("alamat", conn))) return null;
  const rows = await execute(
    "SELECT * FROM alamat WHERE pegawai_nik = ? AND tipe_alamat = ? LIMIT 1",
    [nik, tipe],
    conn
  );
  return rows[0] || null;
}

async function upsertAlamat(conn, nik, tipe, alamatData) {
  if (!(await tableExists("alamat", conn))) return;

  const alamatColumns = await getTableColumns("alamat", conn);
  const payload = pickPayload(alamatData || {}, ALAMAT_FIELDS.filter((f) => alamatColumns.includes(f)));
  if (Object.keys(payload).length === 0) return;

  const existing = await execute(
    "SELECT 1 FROM alamat WHERE pegawai_nik = ? AND tipe_alamat = ? LIMIT 1",
    [nik, tipe],
    conn
  );

  if (existing.length > 0) {
    const keys = Object.keys(payload);
    const setSql = keys.map((k) => `\`${k}\` = ?`).join(", ");
    const values = keys.map((k) => payload[k]);
    await execute(
      `UPDATE alamat
          SET ${setSql}
        WHERE pegawai_nik = ?
          AND tipe_alamat = ?`,
      [...values, nik, tipe],
      conn
    );
  } else {
    const insertData = { pegawai_nik: nik, tipe_alamat: tipe, ...payload };
    const keys = Object.keys(insertData);
    const placeholders = keys.map(() => "?").join(", ");
    await execute(
      `INSERT INTO alamat (${keys.map((k) => `\`${k}\``).join(", ")})
       VALUES (${placeholders})`,
      keys.map((k) => insertData[k]),
      conn
    );
  }
}

async function replaceKeluarga(conn, nik, keluargaItems) {
  if (!(await tableExists("keluarga", conn))) return;

  await execute("DELETE FROM keluarga WHERE pegawai_nik = ?", [nik], conn);
  if (!Array.isArray(keluargaItems) || keluargaItems.length === 0) return;

  const keluargaColumns = await getTableColumns("keluarga", conn);
  const allowed = keluargaColumns.filter((c) => c !== "id");

  for (const item of keluargaItems) {
    const payload = pickPayload(item, allowed);
    payload.pegawai_nik = nik;

    const keys = Object.keys(payload);
    const placeholders = keys.map(() => "?").join(", ");
    await execute(
      `INSERT INTO keluarga (${keys.map((k) => `\`${k}\``).join(", ")})
       VALUES (${placeholders})`,
      keys.map((k) => payload[k]),
      conn
    );
  }
}

router.get("/", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const q = (req.query.q || "").trim();
    const wilayah = req.query.wilayah;
    const namaUkpd = req.query.nama_ukpd;
    const statusPegawai = req.query.status_pegawai;

    const pegawaiColumns = await getTableColumns("pegawai");
    if (pegawaiColumns.length === 0) {
      return res.status(500).json({ error: "Table pegawai not found." });
    }

    const viewColumns = [
      "nik",
      "tmp_id",
      "nama",
      "nip",
      "nip_norm",
      "nrk",
      "nama_ukpd",
      "wilayah",
      "status_pegawai",
      "jabatan_orb",
    ];

    const selectSql = viewColumns
      .map((col) => (pegawaiColumns.includes(col) ? `p.\`${col}\` AS \`${col}\`` : `NULL AS \`${col}\``))
      .join(", ");

    const where = [];
    const params = [];

    if (q) {
      const qConditions = [];
      if (pegawaiColumns.includes("nama")) {
        qConditions.push("p.nama LIKE ?");
        params.push(`%${q}%`);
      }
      if (pegawaiColumns.includes("nik")) {
        qConditions.push("p.nik LIKE ?");
        params.push(`%${q}%`);
      }
      if (pegawaiColumns.includes("nip_norm")) {
        qConditions.push("p.nip_norm LIKE ?");
        params.push(`%${q}%`);
      }
      if (qConditions.length > 0) {
        where.push(`(${qConditions.join(" OR ")})`);
      }
    }

    if (wilayah && pegawaiColumns.includes("wilayah")) {
      where.push("p.wilayah = ?");
      params.push(wilayah);
    }
    if (namaUkpd && pegawaiColumns.includes("nama_ukpd")) {
      where.push("p.nama_ukpd = ?");
      params.push(namaUkpd);
    }
    if (statusPegawai && pegawaiColumns.includes("status_pegawai")) {
      where.push("p.status_pegawai = ?");
      params.push(statusPegawai);
    }

    const orderColumn = pegawaiColumns.includes("nama")
      ? "nama"
      : pegawaiColumns.includes("nik")
      ? "nik"
      : "tmp_id";

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await execute(
      `SELECT ${selectSql}
         FROM pegawai p
         ${whereSql}
         ORDER BY p.\`${orderColumn}\` ASC
         LIMIT ?
         OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      limit,
      offset,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/:nik", async (req, res, next) => {
  try {
    const nik = req.params.nik;
    const pegawaiRows = await execute("SELECT * FROM pegawai WHERE nik = ? LIMIT 1", [nik]);
    if (pegawaiRows.length === 0) {
      return res.status(404).json({ error: "Pegawai not found" });
    }

    const pegawai = pegawaiRows[0];
    const [alamatKtp, alamatDomisili] = await Promise.all([
      fetchAlamatByType(null, nik, "ktp"),
      fetchAlamatByType(null, nik, "domisili"),
    ]);

    const keluarga = (await tableExists("keluarga"))
      ? await execute("SELECT * FROM keluarga WHERE pegawai_nik = ?", [nik])
      : [];

    const pendidikanFormal = (await tableExists("pendidikan_formal"))
      ? await execute("SELECT * FROM pendidikan_formal WHERE pegawai_nik = ?", [nik])
      : [];

    let riwayatJabatan = [];
    if (await tableExists("riwayat_jabatan")) {
      const rjColumns = await getTableColumns("riwayat_jabatan");
      const orderCol = getOrderColumn(rjColumns, ["tmt_jabatan", "tanggal_jabatan", "created_at", "id"]);
      const orderSql = orderCol ? ` ORDER BY \`${orderCol}\` DESC` : "";
      riwayatJabatan = await execute(
        `SELECT * FROM riwayat_jabatan WHERE pegawai_nik = ?${orderSql} LIMIT 20`,
        [nik]
      );
    }

    let riwayatSkp = [];
    if (await tableExists("riwayat_skp")) {
      const skpColumns = await getTableColumns("riwayat_skp");
      const yearCol = getOrderColumn(skpColumns, ["tahun", "tahun_skp", "tahun_penilaian"], null);
      const orderCol = getOrderColumn(
        skpColumns,
        ["tahun", "tahun_skp", "tahun_penilaian", "tanggal_penilaian", "created_at", "id"],
        null
      );
      const orderSql = orderCol ? ` ORDER BY \`${orderCol}\` DESC` : "";

      if (yearCol) {
        const currentYear = new Date().getFullYear();
        const minYear = currentYear - 4;
        riwayatSkp = await execute(
          `SELECT * FROM riwayat_skp
            WHERE pegawai_nik = ?
              AND \`${yearCol}\` >= ?${orderSql}`,
          [nik, minYear]
        );
      } else {
        riwayatSkp = await execute(`SELECT * FROM riwayat_skp WHERE pegawai_nik = ?${orderSql} LIMIT 50`, [nik]);
      }
    }

    return res.json({
      pegawai,
      alamat: {
        ktp: alamatKtp,
        domisili: alamatDomisili,
      },
      keluarga,
      pendidikan_formal: pendidikanFormal,
      riwayat_jabatan: riwayatJabatan,
      riwayat_skp: riwayatSkp,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { nik, nama, alamat, keluarga } = req.body || {};

    if (!nik || !nama) {
      return res.status(400).json({ error: "nik dan nama wajib diisi." });
    }

    await conn.beginTransaction();

    const existing = await execute("SELECT 1 FROM pegawai WHERE nik = ? LIMIT 1", [nik], conn);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: "nik already exists" });
    }

    const pegawaiColumns = await getTableColumns("pegawai", conn);
    const blocked = ["tmp_id"];
    const bodyForPegawai = { ...req.body };
    delete bodyForPegawai.alamat;
    delete bodyForPegawai.keluarga;

    const pegawaiPayload = pickPayload(
      bodyForPegawai,
      pegawaiColumns.filter((c) => !blocked.includes(c))
    );

    const pegawaiKeys = Object.keys(pegawaiPayload);
    if (pegawaiKeys.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: "Tidak ada kolom pegawai valid untuk disimpan." });
    }

    await execute(
      `INSERT INTO pegawai (${pegawaiKeys.map((k) => `\`${k}\``).join(", ")})
       VALUES (${pegawaiKeys.map(() => "?").join(", ")})`,
      pegawaiKeys.map((k) => pegawaiPayload[k]),
      conn
    );

    if (alamat && typeof alamat === "object") {
      if (alamat.ktp) {
        await upsertAlamat(conn, nik, "ktp", alamat.ktp);
      }
      if (alamat.domisili) {
        await upsertAlamat(conn, nik, "domisili", alamat.domisili);
      }
    }

    if (keluarga !== undefined) {
      await replaceKeluarga(conn, nik, keluarga);
    }

    await conn.commit();
    return res.status(201).json({ message: "Pegawai created", nik });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

router.put("/:nik", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const nik = req.params.nik;
    const { alamat, keluarga } = req.body || {};

    await conn.beginTransaction();

    const existing = await execute("SELECT 1 FROM pegawai WHERE nik = ? LIMIT 1", [nik], conn);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Pegawai not found" });
    }

    const pegawaiColumns = await getTableColumns("pegawai", conn);
    const blocked = ["tmp_id", "nik"];
    const bodyForPegawai = { ...req.body };
    delete bodyForPegawai.alamat;
    delete bodyForPegawai.keluarga;

    const updatePayload = pickPayload(
      bodyForPegawai,
      pegawaiColumns.filter((c) => !blocked.includes(c))
    );

    const updateKeys = Object.keys(updatePayload);
    if (updateKeys.length > 0) {
      const setSql = updateKeys.map((k) => `\`${k}\` = ?`).join(", ");
      await execute(
        `UPDATE pegawai
            SET ${setSql}
          WHERE nik = ?`,
        [...updateKeys.map((k) => updatePayload[k]), nik],
        conn
      );
    }

    if (alamat && typeof alamat === "object") {
      if (alamat.ktp) {
        await upsertAlamat(conn, nik, "ktp", alamat.ktp);
      }
      if (alamat.domisili) {
        await upsertAlamat(conn, nik, "domisili", alamat.domisili);
      }
    }

    if (keluarga !== undefined) {
      await replaceKeluarga(conn, nik, keluarga);
    }

    await conn.commit();
    return res.json({ message: "Pegawai updated", nik });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

router.delete("/:nik", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const nik = req.params.nik;
    await conn.beginTransaction();

    for (const table of RELATED_DELETE_TABLES) {
      if (await tableExists(table, conn)) {
        await execute(`DELETE FROM \`${table}\` WHERE pegawai_nik = ?`, [nik], conn);
      }
    }

    const result = await execute("DELETE FROM pegawai WHERE nik = ?", [nik], conn);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ error: "Pegawai not found" });
    }

    await conn.commit();
    return res.json({ message: "Pegawai deleted", nik });
  } catch (err) {
    await conn.rollback();
    return next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;

