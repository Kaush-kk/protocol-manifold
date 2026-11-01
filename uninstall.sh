#!/bin/bash
echo "🗑️ Uninstalling Protocol Manifold..."
gnome-extensions disable math-manifold@kaush 2>/dev/null || true
rm -rf "$HOME/.local/share/gnome-shell/extensions/math-manifold@kaush"
rm -rf "$HOME/.config/manifold"
sudo rm -f /usr/local/bin/manifoldctl
gsettings reset org.gnome.desktop.background picture-uri 2>/dev/null || true
gsettings reset org.gnome.desktop.background picture-uri-dark 2>/dev/null || true
echo "✅ Protocol Manifold uninstalled and default GNOME wallpaper restored."
