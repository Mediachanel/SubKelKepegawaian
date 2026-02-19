# ascii_foto.py
import sys
import shutil
from PIL import Image

# Karakter ASCII dari gelap -> terang
ASCII_CHARS = "@%#*+=-:. "

RESET = "\033[0m"

def gambar_ke_ascii_berwarna(path_foto, max_lebar=120):
    # Baca gambar
    img = Image.open(path_foto).convert("RGB")

    # Ukuran terminal
    cols, _ = shutil.get_terminal_size(fallback=(80, 24))
    lebar = min(max_lebar, cols)

    # Sesuaikan tinggi biar proporsional (karena karakter tinggi)
    w, h = img.size
    aspect_ratio = h / w
    tinggi = int(aspect_ratio * lebar * 0.5)  # 0.5 buat kompensasi tinggi font

    img = img.resize((lebar, tinggi))
    pixels = img.load()

    lines = []

    for y in range(tinggi):
        line = []
        for x in range(lebar):
            r, g, b = pixels[x, y]
            brightness = (r + g + b) / 3
            idx = int(brightness / 255 * (len(ASCII_CHARS) - 1))
            char = ASCII_CHARS[idx]

            # 38;2;r;g;b = warna RGB di terminal
            line.append(f"\033[38;2;{r};{g};{b}m{char}")
        lines.append("".join(line) + RESET)

    return "\n".join(lines)


if __name__ == "__main__":
    # nama file foto, default: foto.jpeg
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = "foto.jpg"   # ganti kalau nama file beda

    try:
        art = gambar_ke_ascii_berwarna(path)
        print(art)
    except FileNotFoundError:
        print(f"File '{path}' tidak ditemukan. Pastikan fotonya ada di folder yang sama.")
