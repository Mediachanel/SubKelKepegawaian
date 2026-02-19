# lirik.py
import time

# ------------ Pengaturan utama ------------
TOTAL_DETIK = 23        # target durasi total lirik
PAUSE_PER_BARIS = 0.25  # jeda antar baris (detik)

RESET  = "\033[0m"
COLORS = [
    "\033[91m",  # merah
    "\033[92m",  # hijau
    "\033[93m",  # kuning
    "\033[94m",  # biru
    "\033[95m",  # ungu
    "\033[96m",  # cyan
]

def jalan_lirik():

    
    lirik_text = [
        "Kalau ada, sembilan nyawa",
        "Mau samamu saja semuanya",
        "Ini dada, isinya kamu semua",
        "Alamak ini kah jatuh cinta?",
    ]

    # Hitung total karakter
    total_chars = sum(len(baris) for baris in lirik_text if baris)

    # Hitung jeda-barisan
    total_pause_time = PAUSE_PER_BARIS * len([b for b in lirik_text if b])

    # Waktu untuk efek ketik
    waktu_ketik = max(TOTAL_DETIK - total_pause_time, 1)

    delay_per_char = waktu_ketik / max(total_chars, 1)

    print("\n== A L A M A K ==\n")

    for i, baris in enumerate(lirik_text):
        warna = COLORS[i % len(COLORS)]
        print(warna, end="")

        # Efek ketik per huruf
        for huruf in baris:
            print(huruf, end="", flush=True)
            time.sleep(delay_per_char)

        print(RESET)
        time.sleep(PAUSE_PER_BARIS)

if __name__ == "__main__":
    jalan_lirik()
