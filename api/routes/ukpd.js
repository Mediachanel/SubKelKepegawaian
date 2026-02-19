const express = require("express");
const { execute, getTableColumns, tableExists } = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    if (!(await tableExists("ukpd"))) {
      return res.status(404).json({ error: "Table ukpd not found." });
    }

    const columns = await getTableColumns("ukpd");
    const safeCols = ["ukpd_id", "nama_ukpd", "jenis_ukpd", "wilayah"].filter((c) => columns.includes(c));
    if (safeCols.length === 0) {
      return res.json({ data: [] });
    }

    const rows = await execute(
      `SELECT ${safeCols.map((c) => `\`${c}\``).join(", ")}
         FROM ukpd
         ORDER BY \`${safeCols[1] || safeCols[0]}\` ASC`
    );

    return res.json({ count: rows.length, data: rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

