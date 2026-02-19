-- Optional performance indexes for sisdmk2
-- Jalankan manual jika index belum ada.

CREATE INDEX idx_pegawai_nama ON pegawai (nama);
CREATE INDEX idx_pegawai_nip_norm ON pegawai (nip_norm);
CREATE INDEX idx_pegawai_wilayah ON pegawai (wilayah);
CREATE INDEX idx_pegawai_nama_ukpd ON pegawai (nama_ukpd);
CREATE INDEX idx_pegawai_status_pegawai ON pegawai (status_pegawai);

CREATE INDEX idx_alamat_pegawai_tipe ON alamat (pegawai_nik, tipe_alamat);
CREATE INDEX idx_keluarga_pegawai_nik ON keluarga (pegawai_nik);
CREATE INDEX idx_pendidikan_formal_pegawai_nik ON pendidikan_formal (pegawai_nik);
CREATE INDEX idx_riwayat_jabatan_pegawai_nik ON riwayat_jabatan (pegawai_nik);
CREATE INDEX idx_riwayat_skp_pegawai_nik ON riwayat_skp (pegawai_nik);

