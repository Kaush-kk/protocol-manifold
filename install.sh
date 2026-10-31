#!/bin/bash
set -e
echo "✦ Installing Protocol Manifold (Live Mathematical Desktop Engine)..."

if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y python3-cairo python3-gobject libnotify
elif command -v apt >/dev/null 2>&1; then
    sudo apt update && sudo apt install -y python3-cairo python3-gi libnotify-bin
elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm python-cairo python-gobject libnotify
fi

EXT_DIR="$HOME/.local/share/gnome-shell/extensions/math-manifold@kaush"
mkdir -p "$EXT_DIR" "$HOME/.config/manifold"
cp -r extension/* "$EXT_DIR/"
sudo cp manifoldctl /usr/local/bin/manifoldctl
sudo chmod +x /usr/local/bin/manifoldctl

/usr/local/bin/manifoldctl gargantua
/usr/local/bin/manifoldctl interstellar
echo "✅ Installed! Log out and log back into GNOME Wayland once, then control via 'manifoldctl'."
